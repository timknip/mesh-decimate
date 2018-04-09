import * as THREE from 'three';
import dat from 'dat.gui';
import bunny from 'bunny';
import teapot from 'teapot';
import {decimate, DecimateGeometry, DecimateTriangle} from '../../src/decimate';
import {vec2, vec3} from 'gl-matrix';
import {simplify_three, Vertex, Triangle} from '../../src/simplify';

var camera, scene, renderer;
var geometry, material, mesh;
var worker = null;
var tt = null;
var emscipten_worker = null;

const OBJ_DATA = `
mtllib box.mtl
o Cube
v -1.000000 -1.000000 1.000000
v -1.000000 1.000000 1.000000
v -1.000000 -1.000000 -1.000000
v -1.000000 1.000000 -1.000000
v 1.000000 -1.000000 1.000000
v 1.000000 1.000000 1.000000
v 1.000000 -1.000000 -1.000000
v 1.000000 1.000000 -1.000000
vn -1.0000 0.0000 0.0000
vn 0.0000 0.0000 -1.0000
vn 1.0000 0.0000 0.0000
vn 0.0000 0.0000 1.0000
vn 0.0000 -1.0000 0.0000
vn 0.0000 1.0000 0.0000
usemtl None
s off
f 2//1 3//1 1//1
f 4//2 7//2 3//2
f 8//3 5//3 7//3
f 6//4 1//4 5//4
f 7//5 1//5 3//5
f 4//6 6//6 8//6
f 2//1 4//1 3//1
f 4//2 8//2 7//2
f 8//3 6//3 5//3
f 6//4 2//4 1//4
f 7//5 5//5 1//5
f 4//6 2//6 6//6
`;

class GUIHelper {

    constructor () {

        this.decimate = 1000;
        this.use_map = true;
        this.map = null;
        this.log = 'decimate';
        this.max_error = 1e-3;
        this.agressiveness = 7;
        this.update = 5;
        this.recompute = false;
        this.emscipten = false;

        var paramKlein = function (u, v, p) {
            u *= Math.PI;
    		v *= 2 * Math.PI;

    		u = u * 2;
    		var x, y, z;
    		if (u < Math.PI) {
    			x = 3 * Math.cos(u) * (1 + Math.sin(u)) + (2 * (1 - Math.cos(u) / 2)) * Math.cos(u) * Math.cos(v);
    			z = -8 * Math.sin(u) - 2 * (1 - Math.cos(u) / 2) * Math.sin(u) * Math.cos(v);
    		} else {
    			x = 3 * Math.cos(u) * (1 + Math.sin(u)) + (2 * (1 - Math.cos(u) / 2)) * Math.cos(v + Math.PI);
    			z = -8 * Math.sin(u);
    		}

    		y = -2 * (1 - Math.cos(u) / 2) * Math.sin(v);

            p.x = x;
            p.y = y;
            p.z = z;
        }

        var paramFunction4 = function (u, v, p) {
            var a = 2;
            var n = 1;
            var m = 1;
            var u = u * 4 * Math.PI;
            var v = v * 2 * Math.PI;
            var x = (a + Math.cos(n * u / 2.0) * Math.sin(v) - Math.sin(n * u / 2.0) * Math.sin(2 * v)) * Math.cos(m * u / 2.0);
            var y = (a + Math.cos(n * u / 2.0) * Math.sin(v) - Math.sin(n * u / 2.0) * Math.sin(2 * v)) * Math.sin(m * u / 2.0);
            var z = Math.sin(n * u / 2.0) * Math.sin(v) + Math.cos(n * u / 2.0) * Math.sin(2 * v);
            p.x = x;
            p.y = y;
            p.z = z;
            return new THREE.Vector3(x, y, z);
        }

        var paramFunction5 = function (u, v) {
            var u = u * Math.PI * 2;
            var v = v * 8 * Math.PI;
            var x = Math.pow(1.2, v) * Math.pow((Math.sin(u)), 0.5) * Math.sin(v);
            var y = v * Math.sin(u) * Math.cos(u);
            var z = Math.pow(1.2, v) * Math.pow((Math.sin(u)), 0.3) * Math.cos(v);
            return new THREE.Vector3(x, y, z);
        }

        this.meshes = {
            bunny: {
                geometry: create_bunny(bunny),
                material: new THREE.MeshNormalMaterial({wireframe:true, side:THREE.DoubleSide}),
                has_texture: false
            },
            teapot: {
                geometry: create_bunny(teapot, 0.03),
                material: new THREE.MeshNormalMaterial({wireframe:true, side:THREE.DoubleSide}),
                has_texture: false
            },
            sphere: {
                geometry: new THREE.SphereGeometry( 0.5, 32, 32 ),
                material: new THREE.MeshBasicMaterial( { color: 0xaaaaaa, wireframe: true} ),
                has_texture: true
            },
            sphere64: {
                geometry: new THREE.SphereGeometry( 0.5, 64, 64 ),
                material: new THREE.MeshBasicMaterial( { color: 0xffffff, wireframe: false} ),
                has_texture: true
            },
            sphere128: {
                geometry: new THREE.SphereGeometry( 0.5, 128, 128 ),
                material: new THREE.MeshBasicMaterial( { color: 0xffffff, wireframe: true} ),
                has_texture: true
            },
            box: {
                geometry: new THREE.BoxGeometry( 0.5, 0.5, 0.5, 5, 5, 5 ),
                material: new THREE.MeshBasicMaterial( { color: 0xaaaaaa, wireframe: true} ),
                has_texture: true
            },
            torus_knot: {
                geometry: new THREE.TorusKnotGeometry( 0.3, 0.1, 256, 128),
                material: new THREE.MeshNormalMaterial({wireframe:true, side:THREE.DoubleSide}),
                has_texture: false
            },
            extrude: {
                geometry: this.create_extrude(),
                material: new THREE.MeshNormalMaterial({wireframe:true, side:THREE.DoubleSide}),
                has_texture: false
            },
            lathe: {
                geometry: this.create_lathe(),
                material: new THREE.MeshNormalMaterial({wireframe:true, side:THREE.DoubleSide}),
                has_texture: false
            },
            klein: {
                geometry: new THREE.ParametricGeometry( paramKlein, 60, 60 ),
                material: new THREE.MeshNormalMaterial({wireframe:true, side:THREE.DoubleSide}),
                has_texture: false
            }
        }

        this.meshes.klein.geometry.scale(0.05, 0.05, 0.05)

        this.meshes.klein.geometry.rotateX(-Math.PI/3)

        this.mesh = 'sphere';

    }

    create_lathe () {
        var points = [];
        var a = 0.5,
            b = a / 4;
        for ( var i = 0; i < 50; i ++ ) {
        	points.push( new THREE.Vector2( Math.sin( i * 0.02 ) * a + b, ( i - b ) * 0.01 ) );
        }
        let geometry = new THREE.LatheGeometry( points, 40 );
        geometry.center();
        return geometry;
    }

    create_extrude () {
        let length = 0.5, width = 0.3;

        let shape = new THREE.Shape();
        shape.moveTo( 0,0 );
        shape.lineTo( 0, width );
        shape.lineTo( length, width );
        shape.lineTo( length, 0 );
        shape.lineTo( 0, 0 );

        let extrudeSettings = {
        	steps: 16,
        	amount: 1,
        	bevelEnabled: true,
        	bevelThickness: 0.3,
        	bevelSize: 0.2,
        	bevelSegments: 10
        };

        let geometry = new THREE.ExtrudeGeometry( shape, extrudeSettings );
        geometry.center();
        geometry.scale(0.4, 0.4, 0.4)
        return geometry;
    }
}

let helper = null

let earthTexture = new THREE.TextureLoader().load('./earth.jpg', () => {
    init();
    animate();
});

function init () {

    helper = new GUIHelper;

    camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 0.01, 10 );
    camera.position.z = 1;

    scene = new THREE.Scene();
    scene.background = new THREE.Color( 0xaaccff );

    geometry = helper.meshes[helper.mesh].geometry;
    material = helper.meshes[helper.mesh].material;

    helper.map = earthTexture;
    helper.decimate = geometry.faces.length;

    mesh = new THREE.Mesh( geometry, material );

    scene.add( mesh );

    renderer = new THREE.WebGLRenderer( { antialias: true } );

    renderer.setPixelRatio( window.devicePixelRatio );

    renderer.setSize( window.innerWidth, window.innerHeight);

    document.body.appendChild( renderer.domElement );

    worker = new Worker('./decimate-worker.js?rnd='+Math.random());

    emscipten_worker = new Worker('./worker.js?rnd='+Math.random());

    initGUI();

}

function animate () {

    requestAnimationFrame( animate );

    mesh.rotation.x = 0.4;
    mesh.rotation.y += 0.01;

    renderer.render( scene, camera );

}

function prepare_decimate_mesh (geometry) {
    let g = new DecimateGeometry,

        uvt = geometry.faceVertexUvs[0],

        has_uv = (uvt.length === geometry.faces.length);

    g.triangles = geometry.faces.map(({a, b, c}, i) => {

        let triangle = new DecimateTriangle;

        triangle.indices = [a, b, c];

        triangle.uvs = has_uv ? uvt[i].map(u => [u.x, u.y, 0]) : [];

        return triangle;

    });

    g.vertices = geometry.vertices.map(v => [v.x, v.y, v.z]);

    return g;
}

function geometry_to_obj ( geometry ) {

    let {vertices, faces, faceVertexUvs} = geometry,

        hasUV = faceVertexUvs[0].length === faces.length,

        obj = '';

    for ( let i = 0; i < vertices.length; i++ ) {

        let v = vertices[ i ];

        obj += `v ${v.x} ${v.y} ${v.z}\n`;
    }

    if ( hasUV ) {

        for ( let i = 0; i < faces.length; i++ ) {

            let [a, b, c] = faceVertexUvs[ 0 ][ i ];

            obj += `vt ${a.x} ${a.y}\n`;

            obj += `vt ${b.x} ${b.y}\n`;

            obj += `vt ${c.x} ${c.y}\n`;

        }

    }

    for ( let i = 0; i < faces.length; i++ ) {

        let {a, b, c} = faces[ i ],

            j = ( i * 3 ) + 1;

        if ( hasUV ) {

            obj += `f ${a+1}/${j}/1 ${b+1}/${j+1}/1 ${c+1}/${j+2}/1\n`;

        } else {

            obj += `f ${a+1} ${b+1} ${c+1}\n`;

        }

    }

    return obj;

}

function obj_to_geometry ( obj ) {

    let geometry = new THREE.BufferGeometry(),

        lines = obj.split( /[\r\n]/ ).filter( ln => ln &&  ln.length ),

        vertices = [],

        uvs = [],

        uv_indices = [],

        indices = [];

    console.log( 'obj_to_geometry' );

    console.time( 'parse obj' );

    for ( let i = 0; i < lines.length; i++ ) {

        let line = lines[ i ].split(/\s+/),

            cmd = line.shift();

        switch ( cmd ) {

            case 'v':

                vertices.push( line.map( parseFloat) );

                break;

            case 'vt':

                uvs.push( line.map( parseFloat) );

                break;

            case 'f':

                let face = line.map( f => f.split( '/' ).map( i => parseInt( i, 10 ) ) );

                let vidx = face.map ( f => f[ 0 ] - 1 );

                indices.push( vidx );

                if ( face[ 0 ].length > 1 ) {

                    let uvidx = face.map ( f => f[ 1 ] - 1 );

                    uv_indices.push( uvidx );

                }

                break;

            default:

                break;
        }

    }

    console.timeEnd( 'parse obj' );

    console.time( 'obj => BufferGeometry' );

    let num_faces = indices.length,
        v = [],
        uv = [],
        idx = [];

    for ( let i = 0; i < indices.length; i++ ) {

        let [a, b, c] = indices[ i ],

            v0 = vertices[ a ],

            v1 = vertices[ b ],

            v2 = vertices[ c ],

            j = i * 3;

        v.push( v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], v2[0], v2[1], v2[2] );

        if ( uv_indices.length ) {

            let [a, b, c] = uv_indices[ i ].map( i => uvs[ i ] );

            uv.push( a[0], a[1], b[0], b[1], c[0], c[1] );

        }

        idx.push( j, j+1, j+2 );

    }

    geometry.addAttribute( 'position', new THREE.BufferAttribute( new Float32Array(v), 3 ) );

    if ( uv_indices.length ) {

        geometry.addAttribute( 'uv', new THREE.BufferAttribute( new Float32Array(uv), 2 ) );

    }

    geometry.setIndex( new THREE.BufferAttribute( new Uint32Array(idx), 1 ) );

    geometry = (new THREE.Geometry()).fromBufferGeometry(geometry);

    geometry.mergeVertices();

    geometry.computeFaceNormals();

    console.timeEnd( 'obj => BufferGeometry' );

    return geometry;

}

function geometry_to_simplify ( geometry ) {

    let mesh = { vertices: [], triangles: [] },

        {vertices, faces, faceVertexUvs} = geometry,

        numUvSets = faceVertexUvs.length;

    for ( let i = 0; i < vertices.length; i++ ) {

        let v = vertices[ i ],

            vertex = new Vertex();

        vertex.p[ 0 ] = v.x;

        vertex.p[ 1 ] = v.y;

        vertex.p[ 2 ] = v.z;

        mesh.vertices.push( vertex );
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

        mesh.triangles.push( t );

    }

    return mesh;

}

function simplify_to_geometry ({vertices, triangles}) {
    let geometry = new THREE.BufferGeometry(),
        uvbuf = [],
        vbuf = [],
        idxbuf = [];

    triangles.forEach((t, i) => {
        let [a, b, c] = t.v,
            va = vertices[a].p,
            vb = vertices[b].p,
            vc = vertices[c].p,
            idx = i * 3;

        if (t.uvs && t.uvs.length > 0) {
            let [ua, ub, uc] = t.uvs[ 0 ];
            uvbuf.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
        }

        vbuf.push(va[0], va[1], va[2], vb[0], vb[1], vb[2], vc[0], vc[1], vc[2]);
        idxbuf.push(idx, idx+1, idx+2);
    });

    geometry.addAttribute( 'position', new THREE.BufferAttribute( new Float32Array(vbuf), 3 ) );

    if (uvbuf.length) {
        geometry.addAttribute( 'uv', new THREE.BufferAttribute( new Float32Array(uvbuf), 2 ) );
    }

    geometry.setIndex( new THREE.BufferAttribute( new Uint16Array(idxbuf), 1 ) );

    geometry = (new THREE.Geometry()).fromBufferGeometry(geometry);
    geometry.mergeVertices();
    geometry.computeFaceNormals();
    //geometry.computeVertexNormals();
    return geometry;
}

function simplify_to_geometry_buffers( vertices, uvs, indices ) {

    let geometry = new THREE.BufferGeometry();

    geometry.addAttribute( 'position', new THREE.BufferAttribute( vertices, 3 ) );

    if ( uvs ) {
        geometry.addAttribute( 'uv', new THREE.BufferAttribute( uvs, 2 ) );
    }

    geometry.setIndex( new THREE.BufferAttribute( indices, 1 ) );

    geometry = (new THREE.Geometry()).fromBufferGeometry(geometry);
    geometry.mergeVertices();
    geometry.computeFaceNormals();
    //geometry.computeVertexNormals();
    return geometry;
}

function decimated_to_geometry ({vertices, triangles}) {
    let geometry = new THREE.BufferGeometry(),
        vbuf = [],
        uvbuf = [],
        idxbuf = [];

    triangles.forEach(({indices, uvs}, i) => {
        let [a, b, c] = indices,
            va = vertices[a],
            vb = vertices[b],
            vc = vertices[c],
            idx = i * 3;
        vbuf.push(va[0], va[1], va[2], vb[0], vb[1], vb[2], vc[0], vc[1], vc[2]);
        if (uvs && uvs.length === 3) {
            let [ua, ub, uc] = uvs;
            uvbuf.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
        }
        idxbuf.push(idx, idx+1, idx+2);
    });

    geometry.addAttribute( 'position', new THREE.BufferAttribute( new Float32Array(vbuf), 3 ) );
    if (uvbuf.length) {
        geometry.addAttribute( 'uv', new THREE.BufferAttribute( new Float32Array(uvbuf), 2 ) );
    }
    geometry.setIndex( new THREE.BufferAttribute( new Uint16Array(idxbuf), 1 ) );

    geometry = (new THREE.Geometry()).fromBufferGeometry(geometry);
    geometry.mergeVertices();
    geometry.computeFaceNormals();
    geometry.computeVertexNormals();
    return geometry;
}

function create_bunny (bunny, scale = 0.07) {
    let vertices = new Float32Array(bunny.positions.length * 3),
        indices = new Uint32Array(bunny.cells.length * 3),
        geometry = new THREE.BufferGeometry(),
        size = new THREE.Vector3(),
        bounds = bunny.positions.reduce((b, [x,y,z]) =>
            b.expandByPoint(new THREE.Vector3(x, y, z)) ,new THREE.Box3());

    let dx = -bounds.min.x - size.x * 0.5,
        dy = -bounds.min.y - size.y * 0.5,
        dz = -bounds.min.z - size.x * 0.5;

    bunny.positions.forEach(([x, y, z], i) => {
        vertices[i*3+0] = (dx + x) * scale;
        vertices[i*3+1] = (dy + y) * scale;
        vertices[i*3+2] = (dz + z) * scale;
    });

    bunny.cells.forEach(([a, b, c], i) => {
        indices[i*3+0] = a;
        indices[i*3+1] = b;
        indices[i*3+2] = c;
    });

    geometry.addAttribute( 'position', new THREE.BufferAttribute( vertices, 3 ) );
    geometry.setIndex( new THREE.BufferAttribute( indices, 1 ) );

    geometry = (new THREE.Geometry()).fromBufferGeometry(geometry);

    geometry.mergeVertices();
    geometry.computeFaceNormals();
    geometry.computeVertexNormals();

    geometry.center();

    return geometry;
}

function initGUI () {

    let gui = new dat.GUI();

    let wl = gui.add(helper, 'log');

    gui.add(helper, 'emscipten').onChange((v) => {

        if (v) {

            ctl_update.domElement.style.opacity = .2;

            ctl_update.domElement.style.pointerEvents = "none";

            ctl_recompute.domElement.style.opacity = .2;

            ctl_recompute.domElement.style.pointerEvents = "none";

        } else {

            ctl_update.domElement.style.opacity = 1;

            ctl_update.domElement.style.pointerEvents = "auto";

            ctl_recompute.domElement.style.opacity = 1;

            ctl_recompute.domElement.style.pointerEvents = "auto";

        }

    });

    let wc = gui.add(material, 'wireframe').onChange((v) => {
        if (v) {
            mesh.material.map = null;
        } else {
            mesh.material.map = helper.map;
        }
        mesh.material.wireframe = v;
        mesh.material.needsUpdate = true;
    });
    gui.add(helper, 'mesh', Object.keys(helper.meshes)).onChange((m) => {
        mesh.geometry = helper.meshes[m].geometry;
        mesh.material = helper.meshes[m].material;
        tt.max(mesh.geometry.faces.length);
        tt.setValue(mesh.geometry.faces.length);
        wc.object = mesh.material;
        wc.setValue(mesh.material.wireframe);
    });
    tt = gui.add(helper, 'decimate', 0, mesh.geometry.faces.length).step(1).onFinishChange((v) => {
        if ( helper.emscipten ) {
            let obj = geometry_to_obj(helper.meshes[helper.mesh].geometry);
            let perc = v / helper.meshes[helper.mesh].geometry.faces.length;
            let blob = new Blob([obj], {
                type: 'text/plain'
            });
            let name = `em${Math.round(Math.random()*0xffffff)}.obj`;
            let file = new File([blob], name);

            tt.domElement.style.opacity = .2;
            tt.domElement.style.pointerEvents = "none";
            wl.setValue('working...');

            emscipten_worker.postMessage({
                blob:file,
                percentage: perc,
                simplify_name: name,
                agressiveness: helper.agressiveness,
                recompute: helper.recompute,
                update: helper.update
            });
        } else {
            let geometry = geometry_to_simplify(helper.meshes[helper.mesh].geometry);

            let o = {
                geometry: geometry,
                target: v,
                options: {
                    agressiveness: helper.agressiveness,
                    recompute: helper.recompute,
                    update: helper.update
                },
                vertices: new Float32Array( geometry.triangles.length * 3 * 3),
                uvs: new Float32Array( geometry.triangles.length * 3 * 2 ),
                indices: new Uint32Array( geometry.triangles.length * 3 )
            };

            tt.domElement.style.opacity = .2;
            tt.domElement.style.pointerEvents = "none";
            wl.setValue('working...');
            worker.postMessage( o, [ o.vertices.buffer, o.indices.buffer ] );
        }

    });

    gui.add(helper, 'agressiveness', 1, 20).step(1);
    let ctl_update = gui.add(helper, 'update', 1, 10).step(1);
    let ctl_recompute = gui.add(helper, 'recompute');

    worker.addEventListener('message', (e) => {

        mesh.geometry = simplify_to_geometry_buffers(e.data.vertices, e.data.uvs, e.data.indices);
        if (1) {
            tt.domElement.style.opacity = 1;
            tt.domElement.style.pointerEvents = "auto";
            wl.setValue(`decimate ${e.data.took}ms`);
        }
    }, false);

    emscipten_worker.addEventListener('message', (e) => {

        if ( e.data.blob instanceof Blob ) {
            console.log('receiving blob')
            var reader = new FileReader();
            reader.onload = () => {
                console.log('read file')
                mesh.geometry = obj_to_geometry( reader.result );
                tt.domElement.style.opacity = 1;
                tt.domElement.style.pointerEvents = "auto";
                wl.setValue(`decimate ${e.data.took}ms`);
            }
            reader.readAsText(e.data.blob);
        }

    }, false);
}
