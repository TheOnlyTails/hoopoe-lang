#![warn(clippy::all)]

use std::path::PathBuf;

use clap::Parser;

use crate::commands::{
	build::BuildCommand, check::CheckCommand, doc::DocCommand, expand::ExpandCommand,
	format::FormatCommand, new::NewCommand, repl::ReplCommand, run::RunCommand,
};

mod commands;
mod compile_guard;
mod project_support;

pub(crate) trait HoopoeCommand {
	/// Run the command and return the process exit code.
	fn run(&self, manifest: &project_support::ManifestSelection) -> i32;
}

#[derive(clap::Parser)]
#[command(version, about, long_about = None)]
#[command(propagate_version = true)]
#[command(arg_required_else_help = true)]
pub(crate) struct HoopoeCli {
	/// Use exactly this project manifest instead of discovering hoopoe.toml.
	#[arg(long, global = true, value_name = "PATH")]
	manifest: Option<PathBuf>,

	#[command(subcommand)]
	command: Option<HoopoeCommands>,
}

#[derive(clap::Subcommand)]
enum HoopoeCommands {
	Build(BuildCommand),
	Check(CheckCommand),
	Doc(DocCommand),
	Expand(ExpandCommand),
	Format(FormatCommand),
	New(NewCommand),
	Repl(ReplCommand),
	Run(RunCommand),
}

impl HoopoeCommands {
	fn run(&self, manifest: &project_support::ManifestSelection) -> i32 {
		match self {
			HoopoeCommands::Build(cmd) => cmd.run(manifest),
			HoopoeCommands::Check(cmd) => cmd.run(manifest),
			HoopoeCommands::Doc(cmd) => cmd.run(manifest),
			HoopoeCommands::Expand(cmd) => cmd.run(manifest),
			HoopoeCommands::Format(cmd) => cmd.run(manifest),
			HoopoeCommands::New(cmd) => cmd.run(manifest),
			HoopoeCommands::Repl(cmd) => cmd.run(manifest),
			HoopoeCommands::Run(cmd) => cmd.run(manifest),
		}
	}
}

fn main() -> anyhow::Result<()> {
	let cli = HoopoeCli::parse();
	let manifest = project_support::ManifestSelection::from(cli.manifest);

	let code = cli.command.map_or(2, |command| command.run(&manifest));
	std::process::exit(code);
}
