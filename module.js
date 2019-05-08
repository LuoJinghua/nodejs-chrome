module.exports = Object.assign((async opt => {
	try {
		var fetch = require('nodejs-fetch'),
			chrome = (process.argv[1].match('awslambda') && require('chrome-aws-lambda')),
			chronos = ((process.env.SUDO_USER || process.env.USER) == 'chronos'),
			puppeteer = ((chronos || chrome) ? require('puppeteer-core') : require('puppeteer'));
	} catch (e) {
		process.exit(console.error('Error: npm install'));
	}
	var ws, browser, page, json;
	try {
		ws = {browserWSEndpoint: (await (await fetch('http://localhost:9222/json/version')).json()).webSocketDebuggerUrl};
	} catch(e) {
		if (chronos)
			process.exit(console.error('Error: --remote-debugging-port=9222 => /etc/chrome_dev.conf'));
	}
	return await (browser = await (ws ? puppeteer.connect(ws) : puppeteer.launch({
		args: chrome.args,
		executablePath: await chrome.executablePath,
		headless: chrome.headless
	})));
}), {
	configure: {
	}
});
