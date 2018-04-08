importScripts('decimate.js?rnd='+Math.random());

self.addEventListener('message', function(e) {

    let target = e.data.target,

        geometry = e.data.geometry,

        vertices = e.data.vertices,

        uvs = e.data.uvs,

        indices = e.data.indices,

        options = e.data.options,

        t = Date.now();

    console.time('simplify');

    let g = decimate.simplify( geometry, target, options ),

        took = Date.now() - t,

        has_uv = g.triangles.length && g.triangles[ 0 ].uvs;

    console.timeEnd('simplify');

    console.time('worker buffer creation');

    for ( let i = 0; i < g.vertices.length; i++ ) {

        let v = g.vertices[ i ];

        //vertices[ (i*3) + 0 ] = v.p[ 0 ];

        //vertices[ (i*3) + 1 ] = v.p[ 1 ];

        //vertices[ (i*3) + 2 ] = v.p[ 2 ];

    }

    for ( let i = 0; i < g.triangles.length; i++ ) {

        let t = g.triangles[ i ],

            idx = i * 3;

        vertices[ (i*9) + 0 ] = g.vertices[ t.v[ 0 ] ].p[ 0 ];

        vertices[ (i*9) + 1 ] = g.vertices[ t.v[ 0 ] ].p[ 1 ];

        vertices[ (i*9) + 2 ] = g.vertices[ t.v[ 0 ] ].p[ 2 ];

        vertices[ (i*9) + 3 ] = g.vertices[ t.v[ 1 ] ].p[ 0 ];

        vertices[ (i*9) + 4 ] = g.vertices[ t.v[ 1 ] ].p[ 1 ];

        vertices[ (i*9) + 5 ] = g.vertices[ t.v[ 1 ] ].p[ 2 ];

        vertices[ (i*9) + 6 ] = g.vertices[ t.v[ 2 ] ].p[ 0 ];

        vertices[ (i*9) + 7 ] = g.vertices[ t.v[ 2 ] ].p[ 1 ];

        vertices[ (i*9) + 8 ] = g.vertices[ t.v[ 2 ] ].p[ 2 ];

        indices[ (i*3) + 0 ] = idx;

        indices[ (i*3) + 1 ] = idx + 1;

        indices[ (i*3) + 2 ] = idx + 2;

        if ( has_uv ) {

            uvs[ (i*6) + 0 ] = t.uvs[ 0 ][ 0 ][ 0 ];

            uvs[ (i*6) + 1 ] = t.uvs[ 0 ][ 0 ][ 1 ];

            uvs[ (i*6) + 2 ] = t.uvs[ 0 ][ 1 ][ 0 ];

            uvs[ (i*6) + 3 ] = t.uvs[ 0 ][ 1 ][ 1 ];

            uvs[ (i*6) + 4 ] = t.uvs[ 0 ][ 2 ][ 0 ];

            uvs[ (i*6) + 5 ] = t.uvs[ 0 ][ 2 ][ 1 ];

        }

    }

    console.timeEnd('worker buffer creation');

    self.postMessage({

        took: took,

        vertices: vertices,

        uvs: has_uv ? uvs: null,

        indices: indices},

        [ vertices.buffer, uvs.buffer, indices.buffer ]);

}, false);
