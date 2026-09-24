pub mod commands;
pub mod default_paths;
pub mod download;
pub mod extract;
pub mod paths;
pub mod progress;
pub mod service;
pub mod settings;
pub mod state;
pub mod traits;

#[cfg(test)]
mod test_fakes;

#[cfg(test)]
#[path = "service_tests.rs"]
mod service_tests;
