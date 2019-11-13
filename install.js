var lambda = process.argv[1].match('awslambda'),
	chronos = ((process.env.SUDO_USER || process.env.USER) == 'chronos');
require('child_process').execSync([
	'npm install -s form-data '+[].concat(
		(lambda && ['chrome-aws-lambda']),
		(((process.arch != 'x64') || chronos || lambda) ? ['puppeteer-core'] : ['puppeteer', 'request'])
	).filter(Boolean).join(' '),
	((!chronos && !lambda) && (
		(process.arch != 'x64')
		? '(sudo apt install -y chromium-browser || sudo apt install -y chromium)'
		: 'sudo apt install -y libxss-dev libgtk-3-dev'
	)),
	(!lambda && (
		chronos
		? 'crew install expect'
		: 'sudo apt install -y expect rsync'
	))
].filter(Boolean).join(' && '), {stdio:[0,1,2]});
