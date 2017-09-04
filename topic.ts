// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as sns from "./sns";

// A Topic<T> is used to distribute work which will be run conurrently by any susbcribed
// handlers.  Producers can `publish` to the topic, and consumers can `subscribe` to be
// notified when new items are published.
export class Topic<T> implements Stream<T> {
    // Inside + Outside API
    private name: string;
    private topic: aws.sns.Topic;
    private subscriptions: aws.sns.TopicSubscription[];

    // Inside API (lambda-valued properties)
    public publish: (item: T) => Promise<void>;

    // Outside API (constructor and methods)
    constructor(name: string) {
        this.name = name;
        this.topic = new aws.sns.Topic(name, {});
        this.subscriptions = [];
        this.publish = (item) => {
            let awssdk = require("aws-sdk");
            let str = JSON.stringify(item);
            return new awssdk.SNS().publish({
                Message: str,
                TopicArn: this.topic.id,
            }).promise();
        };
    }

    public subscribe(name: string, shandler: (item: T) => Promise<void>) {
        this.subscriptions.push(
            sns.createSubscription(this.name + "_" + name, this.topic, async (snsItem: sns.SNSItem) => {
                let item = JSON.parse(snsItem.Message);
                // TODO[pulumi/pulumi-fabric#238] For now we need to use a different name for `shandler` to avoid
                // accidental conflict with handler inside `createSubscription`
                await shandler(item);
            }),
        );
    }
}

// A Stream<T> provides access to listen to an (infinite) stream of items coming from a
// data source.  Unlike Topic<T>, a Stream provides only access to read from the stream,
// not the ability to publish new items to the stream.
export interface Stream<T> {
     subscribe(name: string, handler: (item: T) => Promise<void>): void;
}
