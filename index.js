"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const TemplateConfig = require('@11ty/eleventy/src/TemplateConfig');
module.exports.configFunction = function configFunction(eleventyConfig, config) {
    eleventyConfig.multisiteConfig = config;
};
