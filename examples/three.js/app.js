import * as THREE from 'three';
import dat from 'dat.gui';
import bunny from 'bunny';
import {decimate, DecimateGeometry, DecimateTriangle} from '../../src/decimate';
import {vec2} from 'gl-matrix';

var camera, scene, renderer;
var geometry, material, mesh;
var worker = null;

class GUIHelper {

    constructor () {

        this.decimate = 1000;
        this.use_map = true;
        this.map = null;
        this.log = 'decimate';

        this.meshes = {
            bunny: {
                geometry: create_bunny(),
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
                material: new THREE.MeshBasicMaterial( { color: 0xffffff, wireframe: false} ),
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
            }
        }

        this.mesh = 'sphere';
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

    geometry = helper.meshes[helper.mesh].geometry;
    material = helper.meshes[helper.mesh].material;

    helper.decimate = geometry.faces.length;

    mesh = new THREE.Mesh( geometry, material );

    scene.add( mesh );

    renderer = new THREE.WebGLRenderer( { antialias: true } );

    renderer.setSize( window.innerWidth, window.innerHeight);

    document.body.appendChild( renderer.domElement );

    worker = new Worker('./decimate-worker.js?rnd='+Math.random());

    initGUI();
}

function animate () {

    requestAnimationFrame( animate );

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
    //geometry.computeVertexNormals();
    return geometry;
}

function create_bunny (scale = 0.07) {
    let vertices = new Float32Array(bunny.positions.length * 3),
        indices = new Uint32Array(bunny.cells.length * 3),
        geometry = new THREE.BufferGeometry(),
        size = new THREE.Vector3(),
        bounds = bunny.positions.reduce((b, [x,y,z]) =>
            b.expandByPoint(new THREE.Vector3(x, y, z)) ,new THREE.Box3());

    bounds.getSize(size);

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

    geometry.computeFaceNormals();
    geometry.computeVertexNormals();

    return (new THREE.Geometry()).fromBufferGeometry(geometry);
}

function initGUI () {

    let gui = new dat.GUI();

    let wl = gui.add(helper, 'log');
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
    let tt = gui.add(helper, 'decimate', 0, mesh.geometry.faces.length).step(1).onFinishChange((v) => {
        let geometry = prepare_decimate_mesh(helper.meshes[helper.mesh].geometry);
        tt.domElement.style.opacity = .2;
        tt.domElement.style.pointerEvents = "none";
        wl.setValue('working...');
        worker.postMessage([geometry, v]);
    });

    worker.addEventListener('message', (e) => {
        mesh.geometry = decimated_to_geometry(e.data);
        if (e.data.complete) {
            tt.domElement.style.opacity = 1;
            tt.domElement.style.pointerEvents = "auto";
            wl.setValue(`decimate ${e.data.took}ms`);
        }
    }, false);
}
