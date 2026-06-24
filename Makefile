# Sotto — private sealed-bid OTC execution on Canton.
#
# Runs in Ubuntu WSL2 with the no-sudo toolchain (JDK 17 + dpm); the build env is
# restored from ~/.sotto-env.sh. If `make` is unavailable, run the underlying
# script directly, e.g. `bash scripts/demo.sh` (see README).

.PHONY: build test sandbox start demo clean

build:            ## Compile the Daml model to a DAR
	cd daml && dpm build

test:             ## Run Daml Script invariant tests (INV-1..INV-5 + audit checks)
	cd daml && dpm test

sandbox start:    ## Start LocalNet (dpm sandbox: Canton + JSON Ledger API on :7575)
	bash scripts/sandbox.sh

demo:             ## Reproducible end-to-end demo + party-scoped INV-1/INV-2 API assertions
	bash scripts/demo.sh

clean:            ## Remove Daml build artifacts
	rm -rf daml/.daml
