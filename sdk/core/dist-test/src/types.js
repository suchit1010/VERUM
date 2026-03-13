"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoleType = exports.SSS_TRANSFER_HOOK_PROGRAM_ID = exports.SSS_STABLECOIN_PROGRAM_ID = exports.SEEDS = void 0;
const web3_js_1 = require("@solana/web3.js");
// ─── PDA Seeds (mirrors sss-common/src/seeds.rs) ─────────────────
exports.SEEDS = {
    CONFIG: Buffer.from("config"),
    ROLES: Buffer.from("roles"),
    MINTER: Buffer.from("minter"),
    BLACKLIST: Buffer.from("blacklist"),
    PAUSE: Buffer.from("pause"),
    EXTRA_ACCOUNT_METAS: Buffer.from("extra-account-metas"),
};
// ─── Program IDs ─────────────────────────────────────────────────
// Generated keypairs — update after devnet deployment
exports.SSS_STABLECOIN_PROGRAM_ID = new web3_js_1.PublicKey("HJ6TUXQ34XhDrmvcozMsBWhSuEVkEcYeqoTWo1Bcmzet");
exports.SSS_TRANSFER_HOOK_PROGRAM_ID = new web3_js_1.PublicKey("6x8XMLoA9FFmVJnaDou9tyKrh9CFynDY7TtKJ54p4dcN");
var RoleType;
(function (RoleType) {
    RoleType["Pauser"] = "Pauser";
    RoleType["Burner"] = "Burner";
    RoleType["Blacklister"] = "Blacklister";
    RoleType["Seizer"] = "Seizer";
})(RoleType || (exports.RoleType = RoleType = {}));
