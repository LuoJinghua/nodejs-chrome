module.exports = (async opt => {
	try {
		var http = require('http'),
			chrome = (process.argv[1].match('awslambda') && require('chrome-aws-lambda')),
			chronos = ((process.env.SUDO_USER || process.env.USER) == 'chronos'),
			puppeteer = ((chronos || chrome) ? require('puppeteer-core') : require('puppeteer'));
	} catch (e) {
		process.exit(console.error('Error: npm install'));
	}
	module.exports.ws = (await new Promise((resolve, reject) => {
		http.get('http://localhost:9222/json/version', (res, body='') => {
			res.on('data', (chunk) => (body += chunk));
			res.on('end', () => resolve(JSON.parse(body)));
		}).on('error', err => reject(err));
	}).then(e => ({
		browserWSEndpoint: e.webSocketDebuggerUrl
	})).catch(() => (chronos ? process.exit(console.error('Error: --remote-debugging-port=9222 => /etc/chrome_dev.conf')) : null)));
	return await (module.exports.browser = await (module.exports.ws ? puppeteer.connect(Object.assign(module.exports.ws, (opt || {}))) : (await chrome.executablePath ? puppeteer.launch(Object.assign({
		args: chrome.args,
		executablePath: await chrome.executablePath,
		headless: chrome.headless
	}, (opt || {}))) : puppeteer.launch(opt))));
});
