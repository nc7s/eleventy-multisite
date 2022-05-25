import { UserConfig } from './lib'
const TemplateConfig = require('@11ty/eleventy/src/TemplateConfig')

module.exports.configFunction = function multisite(eleventyConfig: typeof TemplateConfig, config: UserConfig) {
	eleventyConfig.multisiteConfig = config
}

