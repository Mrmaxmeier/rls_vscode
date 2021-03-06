'use strict';

import * as path from 'path';

import * as child_process from 'child_process';
import * as process from 'process';

import { workspace, Disposable, ExtensionContext, languages, window } from 'vscode';
import { LanguageClient, LanguageClientOptions, SettingMonitor, ServerOptions, TransportKind } from 'vscode-languageclient';

let DEV_MODE = false;

let spinnerTimer = null;
let spinner = ['|', '/', '-', '\\'];
let nextBuildTask = 0;

class Counter {
    count: number;

    constructor() {
        this.count = 0;
    }

    increment() {
        this.count += 1;
    }

    decrementAndGet() {
        this.count -= 1;
        if (this.count < 0) {
            this.count = 0;
        }
        return this.count;
    }
}

export function activate(context: ExtensionContext) {
    let serverOptions: ServerOptions;

    let texls_root = '/home/mrmaxmeier/_GitRepos/texls/'

    window.setStatusBarMessage("TEXLS analysis: starting up");
    console.log('DEV_MODE: ' + DEV_MODE)

    let options = {
        cwd: texls_root,
        env: { 'RUST_BACKTRACE': '1' }
    };

    if (DEV_MODE) {
        serverOptions = { command: "cargo", args: ["run"], options: options };
    } else {
        serverOptions = () => new Promise<child_process.ChildProcess>((resolve, reject) => {
            function spawnServer(...args: string[]): child_process.ChildProcess {
                let cargo_args = ["run", "--manifest-path=" + texls_root + "Cargo.toml"];
                let childProcess = child_process.spawn("cargo", cargo_args, options);

                childProcess.stderr.on('data', data => {
                    //process.stdout.write(data.toString());
                    console.log(data.toString().trim())
                });
                childProcess.on('error', err => {
                    console.error("Could not spawn texls process:", err.message);
                    window.setStatusBarMessage("TeXLS Error: Could not spawn process");
                    throw err;
                })

                return childProcess; // Uses stdin/stdout for communication
            }

            resolve(spawnServer())
        });
    }

    // Options to control the language client
    let clientOptions: LanguageClientOptions = {
        // Register the server for TeX files
        documentSelector: ['tex', 'latex'],
        synchronize: {
            // Synchronize the setting section 'languageServerExample' to the server
            configurationSection: 'languageServerExample',
            // Notify the server about changes to files contained in the workspace
            //fileEvents: workspace.createFileSystemWatcher('**/*.*')
        }
    }

    // Create the language client and start the client.
    let lc = new LanguageClient('TeX Language Server', serverOptions, clientOptions);

    let runningDiagnostics = new Counter();
    lc.onNotification({method: "texDocument/diagnosticsBegin"}, function(f) {
        runningDiagnostics.increment();

        if (spinnerTimer == null) {
            let state = 0;
            spinnerTimer = setInterval(function() {
                window.setStatusBarMessage("TeXLS analysis: working " + spinner[state]);
                state = (state + 1) % spinner.length;
            }, 100);
        }
    })
    lc.onNotification({method: "texDocument/diagnosticsEnd"}, function(f) {
        let count = runningDiagnostics.decrementAndGet();
        if (count == 0) {
            clearInterval(spinnerTimer);
            spinnerTimer = null;

            window.setStatusBarMessage("TeXLS analysis: done");
        }
    })
    let disposable = lc.start();

    // Push the disposable to the context's subscriptions so that the
    // client can be deactivated on extension deactivation
    context.subscriptions.push(disposable);
}
