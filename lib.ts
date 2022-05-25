import { join, relative } from 'path'
import { sync as globSync } from 'fast-glob'
import minimatch from 'minimatch'
import ignore from 'ignore'
import { existsSync, readFileSync } from 'fs'
import debug from 'debug'
const Eleventy = require('@11ty/eleventy')
const ConsoleLogger = require('@11ty/eleventy/src/Util/ConsoleLogger')

export interface SiteConfig {
	outDir?: string,
	configPath?: string,
	pathPrefix?: string,
	templateFormats?: string[],

	ignoreGlobal?: boolean,
	passthroughCopy?: string | string[] | { [key: string]: string },
}

export type SiteSpec = string | [string, SiteConfig]

export interface Config {
	baseDir: string,
	outDir: string,
	sites: SiteSpec[],
	pathPrefix?: string,
	templateFormats?: string[],

	excludes: string[] | string,
	includesDir?: string,
	layoutsDir?: string,
}

export interface UserConfig {
	baseDir?: string,
	outDir?: string,
	sites?: SiteSpec[],
	pathPrefix?: string,
	templateFormats?: string[],

	excludes?: string[] | string,
	includesDir?: string,
	layoutsDir?: string,
}

export const DEFAULT_CONFIG: Config = {
	baseDir: 'sites/',
	outDir: '_out/',
	sites: ['*'],
	includesDir: '_includes/',
	layoutsDir: '_layouts/',

	excludes: [],
}

export interface RunOptions {
	sourceDir: string,
	outDir: string,
	configPath?: string,
	pathPrefix?: string,
	templateFormats?: string[],
	port?: number,
	serve?: boolean,
	watch?: boolean,
	dryRun?: boolean,
	incremental?: boolean,
	quite?: boolean,

	ignoreGlobal?: boolean,
	globalConfigPath?: string,
	passthroughCopy?: string | string[] | { [key: string]: string },
}

// An Eleventy/Util/ConsoleLogger, proxied to add `[multisite] ` before each message.
export const logger = new Proxy(new ConsoleLogger, {
	get: function(target: typeof ConsoleLogger, prop: string) {
		if(['log', 'forceLog', 'warn', 'error'].includes(prop)) {
			return function(msg: string) {
				target[prop](`[multisite] ${msg}`)
			}
		} else {
			return target[prop]
		}
	}
})

export const dbg = debug('eleventy-multisite')

/** Find sites in `baseDir` with given `patterns`.
  *
  * @param {Config} config - Global config.
  * @param {string[] | string} patterns - Glob patterns for the sites.
  * @returns {string[]} Site bases relative to `baseDir`.
  */
export function findSites(config: Config, patterns: string[] | string): string[] {
	const ignoreFilter = existsSync('.gitignore') ? (() => {
		dbg('apply .gitignore rules as it exists')
		const ig = ignore().add(readFileSync('.gitignore').toString())
		return ig.filter.bind(ig)
	})() : (x: string) => x
	if(typeof patterns === 'string') {
		patterns = [patterns]
	}
	if(typeof config.excludes === 'string') {
		config.excludes = [config.excludes]
	}
	let results: string[] = []
	for(let pattern of patterns) {
		pattern = join(config.baseDir, pattern)
		// For the following line tsc throws this error:
		//
		// ```
		// error TS2345: Argument of type 'string[]' is not assignable to parameter of type 'readonly string[] & string'.
		//   Type 'string[]' is not assignable to type 'string'.
		// ```
		//
		// which is weird, because parameter `ignore` has the type `string | ReadonlyArray<string> | undefined`,
		// which is definitely not `readonly string[] & string`, which looks impossible to get.
		// TODO: get rid of this error
		// @ts-ignore
		for(let base of ignoreFilter(globSync(pattern, {
			onlyDirectories: true,
			markDirectories: true, // needed by `ignore`
			ignore: config.excludes
		}))) {
			// Filter out matches under `config.outDir`, `config.includesDir` or `config.layoutsDir`
			if(!relative(config.outDir, base).startsWith('..') ||
			config.includesDir && !relative(config.includesDir, base).startsWith('..') ||
			config.layoutsDir && !relative(config.layoutsDir, base).startsWith('..')) {
				continue
			}
			const relativePath = relative(config.baseDir, base)
			if(!results.includes(relativePath)) {
				results.push(relative(config.baseDir, base))
			}
		}
	}
	dbg('findSites baseDir %s patterns %o results %o', config.baseDir, patterns, results)
	return results
}

/** Run eleventy on a given site.
  *
  * Based on `@11ty/eleventy/cmd.js`, made some changes to suit our need.
  *
  * @param {RunOptions} options
  */
export async function runEleventy(options: RunOptions) {
	const site = options.sourceDir
	dbg('runEleventy site `%s` run options %o', site, options)
	const eleventy = new Eleventy(options.sourceDir, options.outDir, {
		quietMode: options.quite,
		configPath: options.ignoreGlobal ? options.configPath : options.globalConfigPath,
	})
	if(options.ignoreGlobal) {
		dbg('site `%s` ignore global config', site)
	}
	if(!options.ignoreGlobal && options.configPath === undefined) {
		const defaultPath = join(options.sourceDir, '.eleventy.js')
		if(existsSync(defaultPath)) {
			options.configPath = defaultPath
		}
	}
	if(!options.ignoreGlobal && options.configPath !== undefined) {
		dbg('site `%s` apply site config %s', site, options.configPath)
		const siteConfigure = require(join(process.cwd(), options.configPath))
		siteConfigure(eleventy.eleventyConfig.userConfig)
	}
	if(options.passthroughCopy !== undefined) {
		const config = eleventy.eleventyConfig.userConfig
		if(typeof options.passthroughCopy === 'string' ) {
			options.passthroughCopy = [options.passthroughCopy]
		}
		if(options.passthroughCopy instanceof Array) {
			for(let source of options.passthroughCopy) {
				config.addPassthroughCopy(join(options.sourceDir, source))
			}
		} else {
			for(let source of Object.keys(options.passthroughCopy)) {
				options.passthroughCopy[join(options.sourceDir, source)] = options.passthroughCopy[source]
				delete options.passthroughCopy[source]
			}
			config.addPassthroughCopy(options.passthroughCopy)
		}
		dbg('site `%s` passthrough copy %o', config.passthroughCopies)
	}
	// WARNING: Using internal API.
	// Some options above needs a reload.
	eleventy.eleventyConfig.hasConfigMerged = false
	eleventy.eleventyConfig.getConfig()

	eleventy.setPathPrefix(options.pathPrefix)
	eleventy.setDryRun(options.dryRun)
	eleventy.setIncrementalBuild(options.incremental)
	eleventy.setFormats(options.templateFormats)
	await eleventy.init()
	if(options.watch || options.serve) {
		eleventy.watch()
			.catch((e: Error) => logger.warn(`runEleventy watch error: ${e}`))
			.then(() => {
				if(options.serve) {
					eleventy.serve(options.port)
				} else {
					logger.forceLog(`Started watching site ${site}`)
				}
			})
	} else {
		// TODO: support JSON / ndjson builds
		await eleventy.executeBuild()
	}
}

/** Match a `SiteConfig` for a given site, going through glob patterns.
  *
  * @param {Config} config
  * @param {string} site
  * @returns {SiteConfig | undefined}
  *
  */
export function matchSiteConfig(config: Config, site: string): SiteConfig | undefined {
	for(let siteSpec of config.sites) {
		const glob = typeof siteSpec === 'string' ? siteSpec : siteSpec[0]
		if(minimatch(site, glob)) {
			if(typeof siteSpec === 'string') {
				// string sitespec uses default config
				return
			} else {
				return siteSpec[1]
			}
		}
	}
}

