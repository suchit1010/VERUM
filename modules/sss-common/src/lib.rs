pub mod seeds;
pub mod validation;

pub use seeds::*;
pub use validation::*;

/// Maximum length for stablecoin name
pub const MAX_NAME_LEN: usize = 32;
/// Maximum length for stablecoin symbol  
pub const MAX_SYMBOL_LEN: usize = 10;
/// Maximum length for metadata URI
pub const MAX_URI_LEN: usize = 200;
/// Maximum length for blacklist reason
pub const MAX_REASON_LEN: usize = 128;
/// Maximum number of roles per config
pub const MAX_ROLES: usize = 10;
