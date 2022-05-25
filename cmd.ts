#!/usr/bin/env node
import { join } from 'path'
import minimist from 'minimist'
import debug from 'debug'
import {
	findSites, runEleventy, matchSiteConfig,
	Config, SiteConfig, RunOptions, DEFAULT_CONFIG,
	logger
} from './lib'
const Eleventy = require('@11ty/eleventy')

const dbg = debug('eleventy-multisite:cmd')

const args = minimist(process.argv.slice(2), {
	string: [
		'basedir', 'outdir', 'config', 'exclude', 'pathprefix',
		'b', 'o', 'c', 'E', 'P'
	],
	boolean: [
		'watch', 'serve', 'dryrun',
		'w', 'S', 'n'
	],
})
args.basedir = args.basedir || args.b
args.outdir = args.outdir || args.o
args.config = args.config || args.c
args.exclude = args.exclude || args.E
args.watch = args.watch || args.w
args.serve = args.serve || args.S
args.port = args.port || args.p
args.dryrun = args.dryrun || args.n
args.pathprefix = args.pathprefix || args.P

if(args.version || args.v) {
	console.log('eleventy-multisite', require('./package.json').version)
	process.exit()
} else if(args.help || args.h) {
	console.log(`Usage: eleventy-multisite [OPTIONS] SITE [SITE2 SITE3...]

Examples:
	eleventy-multisite
	eleventy-multisite --basedir . --outdir _build

Options:
	-b, --basedir    base directory of sites, default \`sites/\`
	-o, --outdir     base directory of output, default \`_out/\`
	-c, --config     configuration file path, default \`.eleventy.js\`
	-E, --exclude    exclude this glob pattern, can be specified multiple times
	-w, --watch      watch and rebuild as files change
	-S, --serve      start a web server serving built site, automatically \`--watch\`
	                 can't watch more than one site in one command
	-p, --port       serve at this port, defualt 8080 (Eleventy default)
	-n, --dryrun     don't write to disk; passed to Eleventy
	-P, --pathprefix see Eleventy doc [1]
	-v, --version
	-h, --help

	1: https://www.11ty.dev/docs/config/#deploy-to-a-subdirectory-with-a-path-prefix

Arguments:
	SITE             glob patterns for sites to operate on, under \`basedir\`

`)
	process.exit()
}

const globs = args._

if(globs.length === 0) {
	dbg('no glob patterns specified, using config values')
}

const config: Config = Object.assign({}, DEFAULT_CONFIG, (new Eleventy(args.basedir, args.outdir, {
		configPath: args.config,
	})).eleventyConfig.userConfig.multisiteConfig || {}
)

if(args.basedir) {
	config.baseDir = args.basedir
}
if(args.outdir) {
	config.outDir = args.outdir
}
if(args.pathprefix) {
	config.pathPrefix = args.pathprefix.split(',')
}
if(args.formats) {
	config.templateFormats = args.formats.split(',')
}

dbg('global config %o', config)

const sites = findSites(config, globs.length == 0 ?
	config.sites.map(spec => typeof spec === 'string' ? spec : spec[0]) :
	globs
)

dbg('collected sites %o', sites)

if(args.serve && sites.length > 1) {
	logger.error(`Can't serve more than one site.`)
	process.exit(1)
}

if(sites.length == 0) {
	logger.warn('No site is found.')
	process.exit(1)
}

// TODO: get rid of this async workaround
(async () => {
	for(let site of sites) {
		logger.log(`running Eleventy for site ${site}`)
		const siteConfig: SiteConfig = matchSiteConfig(config, site) || {}
		dbg('site `%s` config %o', site, siteConfig)
		const runOptions: RunOptions = {
			sourceDir: join(config.baseDir, site),
			outDir: join(config.outDir, site),
			configPath: siteConfig.configPath,
			globalConfigPath: args.config,
			pathPrefix: siteConfig.pathPrefix || config.pathPrefix,
			templateFormats: siteConfig.templateFormats || config.templateFormats,
			port: args.port,
			serve: args.serve,
			watch: args.watch,
			dryRun: args.dryrun,
			incremental: args.incremental,
			quite: args.quite,
		}
		await runEleventy(runOptions)
	}
})()
