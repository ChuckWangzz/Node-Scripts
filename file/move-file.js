var async = require("async");
var fs = require("fs");
var path = require("path");
var config = require("./file.config.js");
var readline = require("readline");
var os = require("os");
//获取命令行参数
var env = process.argv[2];

if (!config[env]) {
	console.log('\u001b[31mERR! \u001b[39m' + 'the ' + env + " config not in ./config/file.config.js");
	process.exit(0);
}

// cursively make dir   
function mkdirs(p, mode, f, made) {
	if (typeof mode === 'function' || mode === undefined) {
		f = mode;
		mode = 0777 & (~process.umask());
	}
	if (!made)
		made = null;

	var cb = f || function () {};
	if (typeof mode === 'string')
		mode = parseInt(mode, 8);
	p = path.resolve(p);

	fs.mkdir(p, mode, function (er) {
		if (!er) {
			made = made || p;
			return cb(null, made);
		}
		switch (er.code) {
			case 'ENOENT':
				mkdirs(path.dirname(p), mode, function (er, made) {
					if (er) {
						cb(er, made);
					} else {
						mkdirs(p, mode, cb, made);
					}
				});
				break;

				// In the case of any other error, just see if there's a dir  
				// there already.  If so, then hooray!  If not, then something  
				// is borked.  
			default:
				fs.stat(p, function (er2, stat) {
					// if the stat fails, then that's super weird.  
					// let the original error be the failure reason.  
					if (er2 || !stat.isDirectory()) {
						cb(er, made);
					} else {
						cb(null, made)
					};
				});
				break;
		}
	});
}
// single file copy  
function copyFile(file, toDir, cb) {
    async.waterfall([
        function (callback) {
            fs.exists(toDir, function (exists) {
                if (exists) {
                    callback(null, false);
                } else {
                    callback(null, true);
                }
            });
        },
        function (need, callback) {
            if (need) {
                mkdirs(path.dirname(toDir), callback);
            } else {
                callback(null, true);
            }
        },
        function (p, callback) {
            var reads = fs.createReadStream(file);
            var writes = fs.createWriteStream(path.join(path.dirname(toDir), path.basename(file)));

            if ( env == 'list' ) {
                var objReadline = readline.createInterface({
                    input: reads
                });
                objReadline.on('line', (line)=>{
                    var reg = /\/(widget|page)(\/[^]+)+.vm/g;

                    var tmp = line.replace(reg, function (name) {
                        console.log(name);
                        var reg_folder = /^\/(widget|page)(\/)/g;
                        return name.replace(reg_folder, function (folder) {
                            console.log(folder);
                            return folder == '/widget/' ? '/widget_m/' : '/page_m/';
                        });
                    });
                    writes.write(tmp + os.EOL); // 下一行
                });
                objReadline.on('close', ()=>{
                    console.log('readline close...');
                });
			} else {
                reads.pipe(writes);
			}

            // reads.pipe(writes);
            //don't forget close the  when  all the data are read  
            reads.on("end", function () {
                writes.end();
                callback(null);
            });
            reads.on("error", function (err) {
                console.log("error occur in reads");
                callback(true, err);
            });

        }
    ], cb);

}

// cursively count the  files that need to be copied  

function _ccoutTask(from, to, cbw) {
	async.waterfall([
		function (callback) {
			fs.stat(from, callback);
		},
		function (stats, callback) {
			if (stats.isFile()) {
				cbw.addFile(from, to);
				callback(null, []);
			} else if (stats.isDirectory()) {
				fs.readdir(from, callback);
			}
		},
		function (files, callback) {
			if (files.length) {
				for (var i = 0; i < files.length; i++) {
					_ccoutTask(path.join(from, files[i]), path.join(to, files[i]), cbw.increase());
				}
			}
			callback(null);
		}
	], cbw);

}
// wrap the callback before counting  
function ccoutTask(from, to, cb) {
	var files = [];
	var count = 1;

	function wrapper(err) {
		count--;
		if (err || count <= 0) {
			cb(err, files)
		}
	}
	wrapper.increase = function () {
		count++;
		return wrapper;
	}
	wrapper.addFile = function (file, dir) {
		files.push({
			file: file,
			dir: dir
		});
	}

	_ccoutTask(from, to, wrapper);
}


function copyDir(from, to, cb) {
	if (!cb) {
		cb = function () {};
	}
	async.waterfall([
		function (callback) {
			fs.exists(from, function (exists) {
				if (exists) {
					callback(null, true);
				} else {
					console.log(from + " not exists");
					callback(true);
				}
			});
		},
		function (exists, callback) {
			fs.stat(from, callback);
		},
		function (stats, callback) {
			if (stats.isFile()) {
				// one file copy  
				copyFile(from, to, function (err) {
					if (err) {
						// break the waterfall  
						callback(true);
					} else {
						callback(null, []);
					}
				});
			} else if (stats.isDirectory()) {
				ccoutTask(from, to, callback);
			}
		},
		function (files, callback) {
			// prevent reaching to max file open limit            
			async.mapLimit(files, 1000, function (f, cb) {
				copyFile(f.file, f.dir, cb);
			}, callback);
		}
	], cb);
}

function deleteFiles(path) {
	if (fs.existsSync(path)) {
		if (fs.statSync(path).isDirectory()) {
			var files = [];
			files = fs.readdirSync(path);
			files.forEach(function (file, index) {
				var curPath = path + "/" + file;
				if (fs.statSync(curPath).isDirectory()) { // recurse  
					deleteFiles(curPath);
				} else { // delete file  
					fs.unlinkSync(curPath);
				}
			});
			fs.rmdirSync(path);
		} else {
			fs.unlinkSync(path);
		}
	}
}

var start = new Date().getTime();

if (!Array.isArray(config[env])) {
	console.log('\u001b[31mERR! \u001b[39m' + 'the ' + env + " is not a array");
	process.exit(0);
}

config[env].forEach((item, itemIndex) => {
	try {
		var srcArr = item.srcDir;
		var desArr = item.desDir;
		var filterFiles = item.filterFiles;
		if (typeof srcArr == 'undefined' || typeof desArr == 'undefined' || typeof filterFiles == 'undefined') {
			console.log('\u001b[31mERR! \u001b[39m' + "absence srcArr or desArr or filterFiles");
			process.exit(0);
		}
		if (!Array.isArray(srcArr)) {
			srcArr = [srcArr];
		}
		if (!Array.isArray(desArr)) {
			desArr = [desArr];
		}
		if (!Array.isArray(filterFiles)) {
			filterFiles = [filterFiles];
		}
		
		desArr.forEach((desPath, desIndex) => {
			srcArr.forEach((srcPath, srcIndex) => {
				// // 修改列表页文件夹名称
				// if (process.argv[2] == 'list'){
				// 	fs.readdir(srcPath, function(err, files) {
				// 		files.forEach(function(filename) {
				// 			var oldPath = srcPath +'/'+ filename,
				// 			newPath = srcPath +'/'+ filename + '_m';
				// 			console.log(newPath)
				// 			fs.rename(oldPath, newPath, function(err) {
				// 				if (!err) {
				// 					console.log(filename + '名称替换成功!')
				// 				}
				// 			});
				//
				// 		});
				// 	});
				// }
	
				copyDir(srcPath, desPath, function (err) {
					if (err) {
						console.log("error ocur");
						console.dir(err);
					} else {
						console.log("copy ok");
						console.log("consume time:" + (new Date().getTime() - start));
						setTimeout(function(){
						filterFiles.forEach(function (path) {
						    deleteFiles(path);
						});
						},100);
					}
				});
			});
		});
	} catch (error) {
		console.log(error);
	}
});