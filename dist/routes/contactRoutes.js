"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const contactValidator_ts_1 = require("../validators/contactValidator.ts");
const contactController_js_1 = require("../controller/contactController.js");
const router = express_1.default.Router();
router.post('/identify', contactValidator_ts_1.validateContactData, contactController_js_1.identifyContact);
exports.default = router;
