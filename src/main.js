#!/usr/bin/env node

'use strict';

require = require('esm')(module);

const fs = require('fs');
const path = require('path');
const request = require('request');

const MBTiles = require('@mapbox/mbtiles');

const packageJson = require('../package');

const args = process.argv;
if (args.length >= 3 && args[2][0] !== '-') {
	args.splice(2, 0, '--mbtiles');
}

const opts = require('commander')
	.description('tileserver-gl startup options')
	.usage('tileserver-gl [mbtiles] [options]')
	.option(
		'--mbtiles <file>',
		'MBTiles file (uses demo configuration);\n' +
			'\t                  ignored if the configuration file is also specified'
	)
	.option('-c, --config <file>', 'Configuration file [config.json]', 'config.json')
	.option('-b, --bind <address>', 'Bind address')
	.option('-p, --port <port>', 'Port [8080]', 8080, parseInt)
	.option('-C|--no-cors', 'Disable Cross-origin resource sharing headers')
	.option('-u|--public_url <url>', 'Enable exposing the server on subpaths, not necessarily the root of the domain')
	.option('-V, --verbose', 'More verbose output')
	.option('-s, --silent', 'Less verbose output')
	.option('-l|--log_file <file>', 'output log file (defaults to standard out)')
	.option(
		'-f|--log_format <format>',
		'define the log format:  https://github.com/expressjs/morgan#morganformat-options'
	)
	.version(packageJson.version, '-v, --version')
	.parse(args);

console.log(`Starting ${packageJson.name} v${packageJson.version}`);

const startServer = (configPath, config) => {
	let publicUrl = opts.public_url;
	if (publicUrl && publicUrl.lastIndexOf('/') !== publicUrl.length - 1) {
		publicUrl += '/';
	}
	return require('./server')({
		configPath: configPath,
		config: config,
		bind: opts.bind,
		port: opts.port,
		cors: opts.cors,
		verbose: opts.verbose,
		silent: opts.silent,
		logFile: opts.log_file,
		logFormat: opts.log_format,
		publicUrl: publicUrl,
	});
};

const startWithMBTiles = (mbtilesFile) => {
	console.log(`[INFO] Automatically creating config file for ${mbtilesFile}`);
	console.log(`[INFO] Only a basic preview style will be used.`);
	console.log(`[INFO] See documentation to learn how to create config.json file.`);

	mbtilesFile = path.resolve(process.cwd(), mbtilesFile);

	const mbtilesStats = fs.statSync(mbtilesFile);
	if (!mbtilesStats.isFile() || mbtilesStats.size === 0) {
		console.log(`ERROR: Not valid MBTiles file: ${mbtilesFile}`);
		process.exit(1);
	}
	const instance = new MBTiles(mbtilesFile, (err) => {
		if (err) {
			console.log('ERROR: Unable to open MBTiles.');
			console.log(`       Make sure ${path.basename(mbtilesFile)} is valid MBTiles.`);
			process.exit(1);
		}

		instance.getInfo((err, info) => {
			if (err || !info) {
				console.log('ERROR: Metadata missing in the MBTiles.');
				console.log(`       Make sure ${path.basename(mbtilesFile)} is valid MBTiles.`);
				process.exit(1);
			}
			const bounds = info.bounds;

			// const styleDir = path.resolve(__dirname, "../node_modules/tileserver-gl-styles/");
			const styleDir = path.resolve(__dirname, '../styles');

			console.log('Styles path is ' + styleDir);

			const config = {
				options: {
					paths: {
						root: styleDir,
						fonts: 'fonts',
						styles: 'styles',
						mbtiles: path.dirname(mbtilesFile),
					},
				},
				styles: {},
				data: {},
			};

			if (info.format === 'pbf' && info.name.toLowerCase().indexOf('openmaptiles') > -1) {
				config['data'][`v3`] = {
					mbtiles: path.basename(mbtilesFile),
				};

				const styles = fs.readdirSync(path.resolve(styleDir, 'styles'));
				for (let styleName of styles) {
					const styleFileRel = styleName + '/style.json';
					const styleFile = path.resolve(styleDir, 'styles', styleFileRel);
					if (fs.existsSync(styleFile)) {
						config['styles'][styleName] = {
							style: styleFileRel,
							tilejson: {
								bounds: bounds,
							},
						};
					}
				}
			} else {
				console.log(`WARN: MBTiles not in "openmaptiles" format. Serving raw data only...`);
				config['data'][(info.id || 'mbtiles').replace(/\//g, '_').replace(/:/g, '_').replace(/\?/g, '_')] = {
					mbtiles: path.basename(mbtilesFile),
				};
			}

			if (opts.verbose) {
				console.log(JSON.stringify(config, undefined, 2));
			} else {
				console.log('Run with --verbose to see the config file here.');
			}

			return startServer(null, config);
		});
	});
};

fs.stat(path.resolve(opts.config), (err, stats) => {
	if (err || !stats.isFile() || stats.size === 0) {
		let mbtiles = opts.mbtiles;
		if (!mbtiles) {
			// try to find in the cwd
			const files = fs.readdirSync(process.cwd());
			for (let filename of files) {
				if (filename.endsWith('.mbtiles')) {
					const mbTilesStats = fs.statSync(filename);
					if (mbTilesStats.isFile() && mbTilesStats.size > 0) {
						mbtiles = filename;
						break;
					}
				}
			}
			if (mbtiles) {
				console.log(`No MBTiles specified, using ${mbtiles}`);
				return startWithMBTiles(mbtiles);
			} else {
				const url =
					'https://github.com/maptiler/tileserver-gl/releases/download/v1.3.0/zurich_switzerland.mbtiles';
				const filename = 'zurich_switzerland.mbtiles';
				const stream = fs.createWriteStream(filename);
				console.log(`No MBTiles found`);
				console.log(`[DEMO] Downloading sample data (${filename}) from ${url}`);
				stream.on('finish', () => startWithMBTiles(filename));
				return request.get(url).pipe(stream);
			}
		}
		if (mbtiles) {
			return startWithMBTiles(mbtiles);
		}
	} else {
		console.log(`Using specified config file from ${opts.config}`);
		return startServer(opts.config, null);
	}
});
