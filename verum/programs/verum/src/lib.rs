pub mod error;
pub mod instructions;
pub mod oracle;
pub mod state;
// pub mod cpi_interface; // Will be added when we hook up SSS

use anchor_lang::prelude::*;

pub use error::*;
pub use instructions::*;
pub use state::*;

declare_id!("6G1N31NpMwodAgcF4hgMT9JPmzxELdeUGe66xEPssEht");

#[program]
pub mod verum {
    use super::*;

    // Initial structure setup. Instructions will be added soon.
}
