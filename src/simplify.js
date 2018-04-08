import {vec3} from 'gl-matrix';
import extend from 'extend';
import {Quadric} from './quadric';
import {interpolate} from './math';

export var SimplifyOptions = {

    agressiveness: 7,

    update: 5,

    recompute: false

};

export class Triangle {

    constructor ( a, b, c ) {

        this.v = [ a, b, c ];

        this.err = new Array( 4 );

        this.deleted = false;

        this.dirty = false;

        this.n = vec3.create();

        this.uvs = null;

    }

}


export class Vertex {

    constructor () {

        this.p = vec3.create();

        this.tstart = 0;

        this.tcount = 0;

        this.q = null;

        this.border = false;

    }

}

class Ref {

    constructor () {

        this.tid = 0;

        this.tvertex = 0;

    }

}

let vertices = [];

let triangles = [];

let refs = [];

export function simplify ( geometry, target_count, options = {} ) {

    options = extend( true, {}, SimplifyOptions, options );

    vertices = geometry.vertices;

    triangles = geometry.triangles;

    return simplify_mesh( target_count, options );

}

export function simplify_three ( geometry, target_count, options = {} ) {

    options = extend( true, {}, SimplifyOptions, options );

    vertices = [];

    triangles = [];

    let {faces, faceVertexUvs} = geometry,

        numUvSets = geometry.faceVertexUvs.length;

    for ( let i = 0; i < geometry.vertices.length; i++ ) {

        let v = geometry.vertices[ i ],

            vertex = new Vertex();

        vertex.p[ 0 ] = v.x;

        vertex.p[ 1 ] = v.y;

        vertex.p[ 2 ] = v.z;

        vertices.push( vertex );
    }

    for ( let i = 0; i < faces.length; i++ ) {

        let {a, b, c} = faces[ i ],

            t = new Triangle( a, b, c );

        if ( numUvSets > 0 && faceVertexUvs[ 0 ].length === faces.length) {

            t.uvs = ( new Array( numUvSets ) ).map( i => [] );
        }

        for ( let j = 0; j < numUvSets; j++ ) {

            if ( faceVertexUvs[ j ].length === faces.length ) {

                t.uvs[ j ] = faceVertexUvs[ j ][ i ].map( u => vec3.fromValues( u.x, u.y, 0 ) );

            }

        }

        t.id = i;

        triangles.push( t );

    }

    let mesh = simplify_mesh( target_count, options );

    geometry.vertices.splice( vertices.length );

    geometry.faces.splice( triangles.length );

    for ( let i = 0; i < numUvSets; i++ ) {

        geometry.faceVertexUvs[ i ].splice( triangles.length );

    }

    for ( let i = 0; i < vertices.length; i++ ) {

        let v = vertices[ i ];

        geometry.vertices[ i ].x = v.p[ 0 ];

        geometry.vertices[ i ].y = v.p[ 1 ];

        geometry.vertices[ i ].z = v.p[ 2 ];

    }

    for ( let i = 0; i < triangles.length; i++ ) {

        let t = triangles [ i ];

        geometry.faces[ i ].a = t.v[ 0 ];

        geometry.faces[ i ].b = t.v[ 1 ];

        geometry.faces[ i ].c = t.v[ 2 ];

        for ( let j = 0; j < numUvSets; j++ ) {

            for ( let k = 0; k < 3; k++ ) {

                geometry.faceVertexUvs[ j ][ i ][ k ].x = t.uvs[ j ][ k ][ 0 ];

                geometry.faceVertexUvs[ j ][ i ][ k ].y = t.uvs[ j ][ k ][ 1 ];

            }

        }

    }

    geometry.verticesNeedUpdate = true;

    geometry.elementsNeedUpdate = true;

    geometry.uvsNeedUpdate = true;

    geometry.normalsNeedUpdate = true;

    return geometry;

}

function simplify_mesh( target_count, options ) {

    let {agressiveness, update, recompute} = options,

        deleted_triangles = 0,

        triangle_count = triangles.length,

        deleted0 = [],

        deleted1 = [],

        p = vec3.create(),

        i = 0, j = 0;

    console.log('agressiveness', agressiveness, 'update', update, 'recompute', recompute);

    // init
    for ( i = triangles.length - 1; i >= 0; i-- ) {

        triangles[ i ].deleted = false;

    }

    for ( let iteration = 0; iteration < 100; iteration++ ) {

        if ( triangle_count - deleted_triangles <= target_count )
            break;

        // update mesh once in a while
        if ( iteration % update === 0 ) {

            update_mesh( iteration, recompute );

        }

        // clear dirty flag
        for ( i = triangles.length - 1; i >= 0; i-- ) {

            triangles[ i ].dirty = false;

        }

        let threshold = 0.000000001*Math.pow( iteration+3, agressiveness );

        for ( i = triangles.length - 1; i >= 0; i-- ) {

            let t = triangles[ i ];

            if ( t.err[ 3 ] >= threshold || t.deleted || t.dirty )
                continue;

            for ( j = 0; j < 3; j++ ) {

                if ( t.err[ j ] >= threshold )
                    continue;

                let i0 = t.v[ j ],

                    i1 = t.v[ (j+1) % 3 ],

                    v0 = vertices[ i0 ],

                    v1 = vertices[ i1 ];

                // Border check
                if ( v0.border || v1.border )
                    continue;

                calculate_error( v0, v1, p );

                deleted0 = [];

                deleted1 = [];

                // dont remove if flipped
                if ( flipped( p, i0, i1, v0, v1, deleted0 ) ) {

                    continue;

                }

                if ( flipped( p, i1, i0, v1, v0, deleted1 ) ) {

                    continue;

                }

                if ( t.uvs ) {

                    update_uvs( i0, v0, p, deleted0 );

                    update_uvs( i0, v1, p, deleted1 );

                }

                // not flipped, so remove edge

                vec3.copy( v0.p, p );

                v0.q.addSelf( v1.q );

                let tstart = refs.length;

                deleted_triangles += update_triangles( i0, v0, deleted0 );

                deleted_triangles += update_triangles( i0, v1, deleted1 );

                let tcount = refs.length - tstart;

                v0.tstart = tstart;

                v0.tcount = tcount;

                break;

            }

            // done?
            if( triangle_count - deleted_triangles <= target_count )
                break;

        }

    } // for each iteration

    return compact_mesh();

}

function update_uvs ( i0, v, p, deleted ) {

    let uv = vec3.create();

    for ( let k = 0; k < v.tcount; k++ ) {

        let r = refs[ v.tstart + k ],

            t = triangles[ r.tid ];

        if ( t.deleted || deleted[ k ] ) continue;

        let vs = t.v.map( i => vertices[ i ].p );

        for ( let i = 0; i < t.uvs.length; i++ ) {

            interpolate( uv, p, vs[ 0 ], vs[ 1 ], vs[ 2 ], t.uvs[ i ] );

            vec3.copy( t.uvs[ i ][ r.tvertex ], uv );

        }

    }

}

function update_triangles ( i0, v, deleted ) {

    let deleted_triangles = 0,

        p = vec3.create();

    for ( let k = 0; k < v.tcount; k++ ) {

        let r = refs[ v.tstart + k ],

            t = triangles[ r.tid ],

            pts = t.v.map( i => vertices[ i ] );

        if ( t.deleted ) continue;

        if ( deleted[ k ] ) {

            t.deleted = true;

            deleted_triangles++;

            continue;

        }

        t.v[ r.tvertex ] = i0;

        t.dirty = true;

        t.err[ 0 ] = calculate_error( pts[0], pts[1], p );

        t.err[ 1 ] = calculate_error( pts[1], pts[2], p );

        t.err[ 2 ] = calculate_error( pts[2], pts[0], p );

        t.err[ 3 ] = Math.min( t.err[0], Math.min( t.err[ 1 ], t.err[ 2 ] ) );

        refs.push( r );

    }

    return deleted_triangles;

}

function flipped ( p, i0, i1, v0, v1, deleted ) {

    for ( let k = 0; k < v0.tcount; k++ ) {

        let ref = refs[ v0.tstart + k ],

            t = triangles[ ref.tid ];

        if ( t.deleted ) continue;

        let s = ref.tvertex,

            id1 = t.v[ (s+1) % 3 ],

            id2 = t.v[ (s+2) % 3 ];

        if ( id1 === i1 || id2 === i1) { // delete?

            deleted[ k ] = true;

            continue;

        }

        let d1 = vec3.subtract( [], vertices[ id1 ].p, p ),

            d2 = vec3.subtract( [], vertices[ id2 ].p, p );

        vec3.normalize( d1, d1 );

        vec3.normalize( d2, d2 );

        if ( Math.abs( vec3.dot( d1, d2 ) ) > 0.99999 )
            return true;

        let n = vec3.cross( [], d1, d2 );

        vec3.normalize( n, n );

        deleted[ k ] = false;

        if ( vec3.dot( n, t.n ) < 0.2 )
            return true;

    }

    return false;

}

function update_mesh ( iteration, recompute = false ) {

    let i, j, k;

    if ( iteration > 0 )  { // compact triangles

    let dst = 0;

        for ( i = 0; i < triangles.length; i++ ) {

            if ( !triangles[ i ].deleted ) {

                triangles[ dst++ ] = triangles[ i ];

            }

        }

        triangles.splice( dst );

    }

    //
    // Init Quadrics by Plane & Edge Errors
    //
    // required at the beginning ( iteration == 0 )
    // recomputing during the simplification is not required,
    // but mostly improves the result for closed meshes
    //
    if( recompute || iteration === 0 ) {

        for ( i = 0; i < vertices.length; i++ ) {

            vertices[ i ].q = new Quadric();

        }

        for ( i = 0; i < triangles.length; i++ ) {

            let t = triangles[ i ],

                p = t.v.map( i => vertices[ i ].p ),

                p10 = vec3.subtract( [], p[ 1 ], p[ 0 ] ),

                p20 = vec3.subtract( [], p[ 2 ], p[ 0 ] ),

                n = vec3.cross( [], p10, p20 ),

                q = new Quadric();

            vec3.normalize( t.n, n );

            q.makePlane( t.n[ 0 ], t.n[ 1 ], t.n[ 2 ], -vec3.dot( t.n, p[ 0 ] ) );

            for ( j = 0; j < 3; j++ ) {

                vertices[ t.v[ j ] ].q.addSelf( q );

            }

        }

        for ( i = 0; i < triangles.length; i++ ) {

            let t = triangles[ i ],

                p = vec3.create(),

                pts = t.v.map( i => vertices[ i ] );

            for ( j = 0; j < 3; j++ ) {

                let v1 = pts[ j ],

                    v2 = pts[ (j+1) % 3];

                t.err[ j ] = calculate_error( v1, v2, p );

            }

            t.err[ 3 ] = Math.min( t.err[0], t.err[ 1 ], t.err[ 2 ] );

        }

    } // if iteration == 0

    for ( i = 0; i < vertices.length; i++ ) {

        vertices[ i ].tstart = 0;

        vertices[ i ].tcount = 0;

    }

    for ( i = 0; i < triangles.length; i++ ) {

        let t = triangles [ i ];

        for ( j = 0; j < 3; j++ ) {

            vertices[ t.v[ j ] ].tcount++;

        }

    }

    let tstart = 0;

    for ( i = 0; i < vertices.length; i++ ) {

        let v = vertices[ i ];

        v.tstart = tstart;

        tstart += v.tcount;

        v.tcount = 0;

    }

    refs = new Array( triangles.length * 3 );

    for ( i = 0; i < refs.length; i++ ) {
        refs[ i ] = new Ref
    }

    for ( i = 0; i < triangles.length; i++ ) {

        let t = triangles [ i ];

        for ( j = 0; j < 3; j++ ) {

            let v = vertices[ t.v[ j ] ];

            refs[ v.tstart + v.tcount ].tid = i;

            refs[ v.tstart + v.tcount ].tvertex = j;

            v.tcount++;

        }

    }

    if( iteration == 0 ) {

        let vcount = [],

            vids = [];

        for ( i = vertices.length - 1; i >= 0; i-- ) {

            vertices[ i ].border = false;

        }

        for ( i = vertices.length - 1; i >= 0; i-- ) {

            let v = vertices[ i ];

            vcount = [];

            vids = [];

            for ( j = v.tcount - 1; j >= 0; j-- ) {

                let k = refs[ v.tstart + j].tid,

                    t = triangles[ k ];

                for ( k = 0; k < 3; k++ ) {

                    let ofs = 0,

                        id = t.v[ k ];

                    while ( ofs < vcount.length ) {

                        if ( vids[ ofs ] === id ) break;

                        ofs++;
                    }

                    if ( ofs === vcount.length ) {

                        vcount.push( 1 );

                        vids.push( id );

                    } else {

                        vcount[ ofs ]++;

                    }

                }

            } // for j to v.tcount

            for ( j = vcount.length - 1; j >= 0; j-- ) {

                if ( vcount[ j ] === 1 ) {

                    vertices[ vids[ j ] ].border = true;

                }

             }

        }

    }

} // update_mesh

function compact_mesh () {

    let dst = 0, i, j;

    for ( i = 0; i < vertices.length; i++ ) {

        vertices[ i ].tcount = 0;

    }

    for ( i = 0; i < triangles.length; i++ ) {

        let t = triangles[ i ];

        if ( t.deleted ) continue;

        triangles[ dst++ ] = triangles[ i ];

        for ( j = 0; j < 3; j++ ) {

            vertices[ t.v[ j ] ].tcount = 1;

        }

    }

    triangles.splice( dst );

    dst = 0;

    for ( i = 0; i < vertices.length; i++ ) {

        if ( vertices[ i ].tcount > 0 ) {

            vertices[ i ].tstart = dst;

            vertices[ dst ].p = vertices[ i ].p;

            dst++;
        }

    }

    for ( i = 0; i < triangles.length; i++ ) {

        let t = triangles[ i ],

            p = vec3.create(),

            uv = vec3.create();

        for ( j = 0; j < 3; j++ ) {

            t.v[ j ] = vertices[ t.v[ j ] ].tstart;

        }

    }

    vertices.splice( dst );

    return { vertices: vertices, triangles: triangles };

}

function calculate_error ( v1, v2, p ) {

    let q = v1.q.add( v2.q ),

        border = v1.border & v2.border,

        target = q.optimize(),

        error = 0;

    if ( target && !border ) {

        error = q.evaluate( target );

        vec3.copy( p, target );

    } else {

        let v3 = vec3.lerp( [], v1.p, v2.p, 0.5 ),

            err1 = q.evaluate( v1.p ),

            err2 = q.evaluate( v2.p ),

            err3 = q.evaluate( v3 );

        error = Math.max( err1, err2, err3 );

        if ( error === err1 ) vec3.copy( p, v1 );

        if ( error === err2 ) vec3.copy( p, v2 );

        if ( error === err3 ) vec3.copy( p, v3 );

    }

    return error;

}
