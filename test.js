"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = __importDefault(require("ava"));
const child_process_1 = require("child_process");
(0, ava_1.default)('it runs', t => {
    (0, child_process_1.execSync)('yarn run eleventy-multisite');
    t.pass();
});
