importScripts('decimate.js?rnd='+Math.random());

self.addEventListener('message', function(e) {
    let g = e.data[0],
        target = e.data[1],
        perc = 100 - Math.round((target / g.triangles.length) * 100),
        t = Date.now();

    console.log('worker: decimating ' + perc + '% (' + g.triangles.length + ' -> ' + target + ' triangles)');

    if (target < g.triangles.length) {
        g = decimate.decimate(g, target);
    }

    console.log('worker result: '+g.triangles.length+' triangles');

    g.took = Date.now() - t;
    g.complete = true;

    self.postMessage(g);
}, false);
