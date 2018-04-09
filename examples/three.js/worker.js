self.addEventListener('message', function(e) {
    const file = e.data.blob;
    const percentage = e.data.percentage;
    const simplify_name = e.data.simplify_name;
    const agressiveness = e.data.agressiveness;

    prepare_and_simplify(file, percentage, simplify_name, agressiveness);
}, false);

var Module = {
    'print': function(text) {
        console.log(text)
        self.postMessage({"log":text});
    }
};

self.importScripts("a.out.js?rnd="+Math.random());

let last_file_name = undefined;

function prepare_and_simplify(file, percentage, simplify_name, agressiveness) {

    var filename = file.name;

    // if simplify on the same file, don't even read the file
    if (filename === last_file_name) {
        console.log("skipping load and create data file");
        simplify(filename, percentage, simplify_name);
        return;
    } else { // remove last file in memory
        if (last_file_name !== undefined)
            Module.FS_unlink(last_file_name);
    }

    last_file_name = filename;
    var fr = new FileReader();
    fr.readAsArrayBuffer(file);
    fr. onloadend = function (e) {
        var data = new Uint8Array(fr.result);
        Module.FS_createDataFile(".", filename, data, true, true);
        simplify(filename, percentage, simplify_name, agressiveness);
    }
}

function simplify(filename, percentage, simplify_name, agressiveness) {
    let t = Date.now();
    Module.ccall("simplify", // c function name
        undefined, // return
        ["string", "number", "string", "number"], // param
        [filename, percentage, simplify_name, agressiveness]
    );
    let out_bin = Module.FS_readFile(simplify_name);
    // sla should work for binary stl
    let file = new Blob([out_bin], {type: 'application/sla'});
    let took = Date.now() - t;

    self.postMessage({"blob":file, took:took});
}
