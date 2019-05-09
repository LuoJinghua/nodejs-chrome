require('child_process').execSync('npm install -s '+[].concat(
	(process.argv[1].match('awslambda') && ["chrome-aws-lambda"]),
	((((process.env.SUDO_USER || process.env.USER) == 'chronos') || process.argv[1].match('awslambda')) ? ["puppeteer-core"] : ["puppeteer"])
).filter(Boolean).join(' '), {stdio:[0,1,2]});
