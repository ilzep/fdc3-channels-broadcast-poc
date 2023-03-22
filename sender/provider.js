function interopOverride(InteropBroker, provider, options, ...args) {
    let externalBroker;
    class InteropOverride extends InteropBroker {

        async initializeBrokers() {
			const platform = fin.Platform.wrapSync({ uuid: externalBroker });

			if (await platform.Application.isRunning()) {
				await this.setupContextGroups();
			}

			await platform.on("platform-api-ready", async () => {
				await this.setupContextGroups();
			});
		}

        async setupContextGroups() { 
			const platformInteropClient = fin.Interop.connectSync(fin.me.uuid, {});
			const platformContextGroups = await platformInteropClient.getContextGroups();

            console.log(JSON.stringify(platformContextGroups));
        }

        constructor() {
            super();
            externalBroker = 'platform_sender_uuid';
            this.initializeBrokers();
        }

    }

    return new InteropOverride(provider, options, ...args);
}

fin.Platform.init({ interopOverride });