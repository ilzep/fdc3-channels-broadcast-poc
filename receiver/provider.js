function interopOverride(InteropBroker, provider, options, ...args) {
    
    class InteropOverride extends InteropBroker {
        externalBroker;
        externalClients;
		allowedURLs = ['http://localhost:4000/sender/sender.html'];
        
        async initializeBrokers(uuid) {
			const platform = fin.Platform.wrapSync({ uuid });

			if (await platform.Application.isRunning()) {
				await this.setupContextGroups(uuid);
			}

			await platform.on("platform-api-ready", async () => {
				await this.setupContextGroups(uuid);
			});
		}

		/**
		 * Called before every action to check if this entity should be allowed to take the action. 
		 * Return false to prevent the action.
		 * @param {*} action - the string action to authorize in camel case
		 * @param {*} payload - the data being sent for this action
		 * @param {*} identity - the connection attempting to dispatch this action
		 * @returns 
		 * NOTE: this is NOT called when we receive a message from the sender
		 */
		async isActionAuthorized(action, payload, identity) {
			console.log(`[isActionAuthorized] action: ${action}`);
			console.log(`[isActionAuthorized] payload: ${JSON.stringify(payload)}`);
			console.log(`[isActionAuthorized] identity: ${JSON.stringify(identity)}`);
			return true;
		}

		/**
		 * Can be used to completely prevent a connection. Return false to prevent connections. Allows all connections by default.
		 * @param {*} id - the identity tryinc to connect
		 * @param {*} payload - optional payload to use in custom implementations, will be undefined by default
		 * @returns 
		 */
		async isConnectionAuthorized(id, payload) {
			
			/** example:
			{"batch":false,"entityType":"window","name":"platform_sender_window_1",
			"parentFrame":"platform_sender_window_1","uuid":"platform_sender_uuid",
			"runtimeUuid":"30.110.74.8/9696/platform_sender_uuid",
			"endpointId":"f4ef651b-d5bd-46c0-9178-57fc5813b732",
			"connectionUrl":"http://localhost:4000/sender/sender.html",
			"isLocalEndpointId":false}
			 */
			console.log(`[isConnectionAuthorized] id: ${JSON.stringify(id)}`);
			/** example:
			 * {"token":"connection_token"}
			 */
			console.log(`[isConnectionAuthorized] payload: ${JSON.stringify(payload)}`);

			// own app always allowed
			if(id.uuid === fin.me.uuid) {
				return true;
			}

			// only green listed URLS allowed to connect
			if(this.allowedURLs.indexOf(id.connectionUrl) == -1) {
				return false;
			}
			// subscribe to context messages for this particular uuid
			this.initializeBrokers(id.uuid);
			
			// if we got here, we are allowing connection
			return true;
		}

		async clientDisconnected(clientIdentity) {
			/**
			 * {"topic":"channel","type":"client-disconnected","uuid":"platform_sender_uuid",
			 * "channelName":"interop-broker-platform_receiver","batch":false,"entityType":"window",
			 * "name":"platform_sender_window_1","parentFrame":"platform_sender_window_1",
			 * "runtimeUuid":"30.110.74.8/9696/platform_sender_uuid",
			 * "endpointId":"f4ef651b-d5bd-46c0-9178-57fc5813b732"}
			 */
			console.log(`[clientDIsconnected] clientIdentity: ${JSON.stringify(clientIdentity)}`);
			// client has shut down, remove all connections
			this.externalClients.clear();
		}

        async setupContextGroups(uuid) { 
			// get all context groups from sender
			// QUESTION - how do we verify app we are connecting to? How do we ensure
			// malicious app is not running with the same UUID?
			const externalInteropClient = fin.Interop.connectSync(uuid, {});
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
						const colorClient = fin.Interop.connectSync(uuid, {});
						await colorClient.joinContextGroup(externalContextGroupInfo.id);
						
						const contextHandler = async context => {

							await platformInteropClient.joinContextGroup(externalContextGroupInfo.id);
                            console.log(`NEW MESSAGE: ${externalContextGroupInfo.id} channel ${JSON.stringify(context)}`);

							// QUESTION - we would like to now send messages to our application view (main window).
							// Would this be an appropriate way of doing it?
							context.color = externalContextGroupInfo.id;
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
        }

    }

    return new InteropOverride(provider, options, ...args);
}

fin.Platform.init({ interopOverride });