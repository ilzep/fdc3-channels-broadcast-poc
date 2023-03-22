function interopOverride(InteropBroker, provider, options, ...args) {
    
    class InteropOverride extends InteropBroker {
        externalBroker;
        externalClients;
        
        async initializeBrokers() {
			const platform = fin.Platform.wrapSync({ uuid: this.externalBroker });

			if (await platform.Application.isRunning()) {
				await this.setupContextGroups();
			}

			await platform.on("platform-api-ready", async () => {
				await this.setupContextGroups();
			});
		}

        async setupContextGroups() { 
			// get all context groups from sender
			// QUESTION - how do we verify app we are connecting to? How do we ensure
			// malicious app is not running with the same UUID?
			const externalInteropClient = fin.Interop.connectSync(this.externalBroker, {});
			const externalContextGroups = await externalInteropClient.getContextGroups();
            console.log('externalContextGroups');
            console.log(JSON.stringify(externalContextGroups));

			// get all context groups for current app - receiver
			const platformInteropClient = fin.Interop.connectSync(fin.me.uuid, {});
			const platformContextGroups = await platformInteropClient.getContextGroups();
            console.log('platformContextGroups');
            console.log(JSON.stringify(platformContextGroups));

			/**
			 * For each of the sender context groups:
			 *  - check if receiver also has the same context group
			 * 	- if receiver has matching context group, connect and start listening
			 */
			const externalContextGroupPromises = externalContextGroups.map(
				async (externalContextGroupInfo) => {
					// check to see if a Platform Client's context group has any of the channels as a externalContextGroup
					const hasPlatformContextGroup = platformContextGroups.some(
						({ id }) => id === externalContextGroupInfo.id
					);

					if (hasPlatformContextGroup) {
						// connect to sender using its UUID
						// QUESTION - we keep making new connections to sender. Is that necessary?
						const colorClient = fin.Interop.connectSync(this.externalBroker, {});
						await colorClient.joinContextGroup(externalContextGroupInfo.id);
						
						const contextHandler = async context => {

							await platformInteropClient.joinContextGroup(externalContextGroupInfo.id);
                            console.log(`NEW MESSAGE: ${externalContextGroupInfo.id} channel ${JSON.stringify(context)}`);
							
							// QUESTION - assumption - no information has to be sent back to the sender if we do not wish to
							// const newContext = context._clientInfo?.uuid
							// 	? context
							// 	: { ...context, _clientInfo: { uuid: this.externalBroker } };
							// await platformInteropClient.setContext(newContext);

							// QUESTION - we would like to now send messages to our application (main window).
							// Would this be an appropriate way of doing it?
							const identity = {uuid: fin.me.uuid, name: 'platform_receiver_window_1'};
							const intent = {name:'ViewChart', context};
							await super.setIntentTarget(intent, identity);
						};
						await colorClient.addContextHandler(contextHandler);
						// return the connected context group and corresponded color client.
						return this.externalClients.set(externalContextGroupInfo.id, colorClient);
					}
				}
			);
			try {
				await Promise.all(externalContextGroupPromises);
			} catch (error) {
				throw new Error(`Not able to setup handlers for external brokers: ${error}`);
			}
        }

        constructor() {
            super();
            this.externalBroker = 'platform_sender_uuid';
            this.externalClients = new Map();
            this.initializeBrokers();
        }

    }

    return new InteropOverride(provider, options, ...args);
}

fin.Platform.init({ interopOverride });