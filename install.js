console.log('nodejs-chrome: install');
var pack = require('./package.json'),
	fs = require('fs');
if (!pack.dependencies)
	fs.writeFile('./package.json', JSON.stringify((pack = Object.assign(pack, {
		dependencies: Object.assign(
			{"nodejs-fetch": "^1.0.0"},
			(process.argv[1].match('awslambda') ? {"chrome-aws-lambda": "^1.15.1"} : {}),
			(!(((process.env.SUDO_USER || process.env.USER) == 'chronos') || process.argv[1].match('awslambda')) ? {"puppeteer-core": "^1.15.0"} : {"puppeteer": "^1.15.0"})
		)
	}))), () => {});
console.log(pack);
