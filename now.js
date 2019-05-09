var pack = require(process.cwd()+'/package.json'),
	fs = require('fs');
	exec = require('child_process').exec;
fs.writeFile(process.cwd()+'/package.json', JSON.stringify(Object.assign({}, pack, {
	dependencies: Object.assign({}, (pack.dependencies || {}), {
		"chrome-aws-lambda": "^1.15.1",
		"puppeteer-core": "^1.15.0"
	})
}), undefined, 4), () => {
	exec('now', (error, stdout, stderr) => {
		console.log((error || stdout));
		fs.writeFile(process.cwd()+'/package.json', JSON.stringify(pack, undefined, 4), () => {});
	});
});
