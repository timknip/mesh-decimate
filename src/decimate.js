import {vec3} from 'gl-matrix';
import extend from 'extend';
import {Quadric} from './quadric';
import * as math from './math';

const DEFAULT_OPTIONS = {
    check_flipped: true,
    max_error: Number.MAX_VALUE
};

class ContractPair {
    constructor (a, b, q = null) {
        this.a = a;
        this.b = b;
        this.target = -1;
        this.q = q;
        this.error = Number.MAX_VALUE;
        this.faces = [[], []];
    }
}

export class DecimateTriangle {

        constructor () {

            this.indices = [];

            this.normals = [];

            this.uvs = [];

        }

}

export class DecimateGeometry {

    constructor () {

        this.vertices = [];

        this.triangles = []

    }

}

export function decimate (geometry, target = 100, max_error = 0, worker = null) {

    let iteration = 1,
        result = geometry;

    max_error = max_error > 0 ? max_error : Number.MAX_VALUE;

    console.log('max_error', max_error);

    console.time('decimate');
    while (result.triangles.length > target) {

        let old = result.triangles.length;

        result = iterate(result, target, {max_error: max_error});

        if (worker) {
            result.took = 0;
            worker.postMessage(result);
        }

        if (result.triangles.length === old) break;
    }
    console.timeEnd('decimate');
    return result;
}

function iterate (geometry, target, options = DEFAULT_OPTIONS) {
    options = extend(true, {}, DEFAULT_OPTIONS, options);

    let {vertices, triangles} = geometry,
        triangle_count = triangles.length,
        triangles_at = vertices.map(v => []),
        star = vertices.map(v => []),
        quadrics = vertices.map(v => new Quadric),
        {check_flipped, max_error} = options,
        deleted_triangles = [],
        dirty_triangles = [];

    for (let i = triangles.length - 1; i >= 0; --i) {

        let [a, b, c] = triangles[i].indices,
            q = Quadric.fromPoints(vertices[a], vertices[b], vertices[c]);

        quadrics[a].addSelf(q);
        quadrics[b].addSelf(q);
        quadrics[c].addSelf(q);

        triangles_at[a].push(i);
        triangles_at[b].push(i);
        triangles_at[c].push(i);

        if (star[a].indexOf(b) < 0) star[a].push(b);
        if (star[a].indexOf(c) < 0) star[a].push(c);
        if (star[b].indexOf(a) < 0) star[b].push(a);
        if (star[b].indexOf(c) < 0) star[b].push(c);
        if (star[c].indexOf(a) < 0) star[c].push(a);
        if (star[c].indexOf(b) < 0) star[c].push(b);

    }

    let new_vertices = [],

        edge_list = vertices.map(v => []),

        edges = vertices.reduce( ( acc, p, i1 ) => {

            star[ i1 ].forEach( i2 => {

                if ( i1 < i2 ) { // only unique edges

                    let q = quadrics[i1].add(quadrics[i2]),

                        pair = new ContractPair(i1, i2, q),

                        target = q.optimize();

                    if ( target ) {

                        pair.target = vertices.length + new_vertices.length;

                        pair.error = q.evaluate(target);

                        new_vertices.push(target);

                        triangles_at.push([]);

                    } else {

                        let err1 = q.evaluate(vertices[i1]),

                            err2 = q.evaluate(vertices[i2]);

                        if ( err1 > err2 ) {

                            pair.target = i1;

                            pair.error = err1;

                        } else {

                            pair.target = i2;

                            pair.error = err2;

                        }

                    }

                    edge_list[pair.a].push(pair);

                    acc.push(pair);

                }

            });

            return acc;

        }, []);

    vertices = vertices.concat(new_vertices);

    let deleted_vertices = vertices.map(v => false);

    function triangle_normal (a, b, c) {
        let ba = vec3.subtract([], b, a),
            ca = vec3.subtract([], c, a),
            n = vec3.cross([], ba, ca);
        vec3.normalize(n, n);
        return n;
    }

    function collapse_edge (edge) {
        let fa = triangles_at[edge.a],
            fb = triangles_at[edge.b],
            all = fa.concat(fb),
            kill = fa.filter(i => fb.indexOf(i) !== -1),
            adjust = all.filter((f, i, arr) => arr.indexOf(f) === i);

        if (kill.some(i => deleted_triangles.indexOf(i) !== -1)) {
            return;
        }

        if (adjust.some(i => dirty_triangles.indexOf(i) !== -1)) {
            return;
        }

        if (all.map(fid => triangles[fid]).some(({indices}) =>
            indices[0] === indices[1] ||
            indices[1] === indices[2] ||
            indices[2] === indices[0]))
            return;

        if ( check_flipped ) {

            for ( let j = all.length - 1; j >= 0; --j ) {

                let fid = all[j],

                    triangle = triangles[fid].indices,

                    ba = vec3.create(),

                    ca = vec3.create(),

                    n1 = vec3.create();

                for ( let i = 0; i < 3; ++i ) {

                    if ( triangle[i] === edge.a || triangle[i] === edge.b ) {

                        let ii = triangle[i],

                            ij = triangle[(i+1) % 3],

                            ik = triangle[(i+2) % 3],

                            n0 = triangle_normal(vertices[ii], vertices[ij], vertices[ik]);

                        vec3.subtract(ba, vertices[ij], vertices[edge.target]),
                        vec3.subtract(ca, vertices[ik], vertices[edge.target]),

                        vec3.normalize(ba, ba);
                        vec3.normalize(ca, ca);

                        // angle acute?
                        if (Math.abs(vec3.dot(ba, ca)) > 0.999)
                            return;

                        vec3.cross(n1, ba, ca);
                        vec3.normalize(n1, n1);

                        // normal flipped?
                        if (vec3.dot(n0, n1) < 0)
                            return;
                    }
                }
            }
        }

        deleted_vertices[edge.a] = true;
        deleted_vertices[edge.b] = true;

        for ( let j = all.length - 1; j >= 0; --j ) {

            let fid = all[ j ],

                triangle = triangles[ fid ].indices,

                uvs = triangles[fid].uvs;

            for ( let i = 0; i < 3; ++i )  {

                if ( triangle[i] === edge.a || triangle[i] === edge.b ) {

                    if ( uvs && uvs.length === 3 ) {
                        // interpolate uvs
                        let out = [ 0, 0, 0 ],
                            p = vertices[ edge.target ],
                            p1 = vertices[ triangle[ 0 ] ],
                            p2 = vertices[ triangle[ 1 ] ],
                            p3 = vertices[ triangle[ 2 ] ];

                        math.interpolate( out, p, p1, p2, p3, uvs );

                        uvs[i] = out;

                    }

                    triangles[fid].indices[i] = edge.target;

                    break;

                }

            }

        }

        edge.a = edge.b;

        deleted_triangles = deleted_triangles.concat(kill);
        dirty_triangles = dirty_triangles.concat(adjust);

        return edge.target;
    }

    edges.sort((a, b) => {
        return a.error - b.error;
    });

    for (let i = 0; i < edges.length; ++i) {
        let edge = edges[i];
        if (triangle_count - deleted_triangles.length <= target)
            break;
        if (edge.a === edge.b || edge.error > max_error) continue;
        collapse_edge(edge);
    }

    let vout = [],
        acc = {};

    // re-index triangles
    triangles = triangles.filter((triangle, i) => {
        let [a, b, c] = triangle.indices;
        if (a === b || b === c || c === a)
            return false;
        if (deleted_triangles.indexOf(i) >= 0)
            return false;
        if (!acc.hasOwnProperty(a)) {
            vout.push(vertices[a]);
            acc[a] = vout.length - 1;
        }
        if (!acc.hasOwnProperty(b)) {
            vout.push(vertices[b]);
            acc[b] = vout.length - 1;
        }
        if (!acc.hasOwnProperty(c)) {
            vout.push(vertices[c]);
            acc[c] = vout.length - 1;
        }
        triangle.indices = [acc[a], acc[b], acc[c]];
        return triangle;
    }, {});

    return {vertices: vout, triangles: triangles};
}
