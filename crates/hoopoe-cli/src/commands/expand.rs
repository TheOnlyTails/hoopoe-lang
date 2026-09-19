use crate::HoopoeCommand;
use crate::project_support::{ManifestSelection, ProjectOperation};

/// Print a project's fully expanded module as formatted Hoopoe source.
#[derive(clap::Args)]
#[command(
	after_long_help = "Examples:\n  hoo expand main\n  hoo expand network/http\n  hoo --manifest ../app/hoopoe.toml expand generated/routes"
)]
pub(crate) struct ExpandCommand {
	/// Canonical module path relative to package.src, without @/, ./, or .hoo.
	#[arg(value_name = "MODULE_PATH")]
	module: String,
}

impl HoopoeCommand for ExpandCommand {
	fn run(&self, manifest: &ManifestSelection) -> i32 {
		let operation = match ProjectOperation::resolve_module(&self.module, manifest) {
			Some(operation) => operation,
			None => return 1,
		};
		let Some(report) = operation.expand() else {
			return 1;
		};
		if !report.diagnostics.is_empty() {
			eprint!("{}", operation.render(&report.diagnostics));
		}
		let Some(source) = report.source else {
			return 1;
		};
		print!("{source}");
		0
	}
}
