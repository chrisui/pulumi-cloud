// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import { AWSLambdaFullAccess } from "@lumi/aws/iam";
import { Permission } from "@lumi/aws/lambda";
import { Function } from "@lumi/aws/serverless/function";
import { Subscription, Topic } from "@lumi/aws/sns";
import { ARN } from "@lumi/aws/types";

export interface QueueItem {
    message: string;
    timestamp: string;
}

interface SNSEvent {
    Records: SNSRecord[];
}

interface SNSRecord {
    EventVersion: string;
    EventSubscriptionArn: string;
    EventSource: string;
    Sns: {
        SignatureVersion: string;
        Timestamp: string;
        Signature: string;
        SigningCertUrl: string;
        MessageId: string;
        Message: string;
        MessageAttributes: { [key: string]: SNSMessageAttribute }
        Type: string;
        UnsubscribeUrl: string;
        TopicArn: string;
        Subject: string;
    };
}

interface SNSMessageAttribute {
    Type: string;
    Value: string;
}

export class Queue {
    private name: string;
    private topic: Topic;
    private subscriptions: Subscription[];

    constructor(name: string) {
        this.name = name;
        this.topic = new Topic(name, {});
        this.subscriptions = [];
    }

    forEach(name: string, handler: (item: any, cb: (error: any) => void)=> void) {
        let resName = this.name + "_" + name;
        let policies: ARN[] = [AWSLambdaFullAccess]; // TODO: Least privelege
        let lambda = new Function(resName, policies, (ev: SNSEvent, ctx, cb) => {
            let records = ev.Records;
            let numRecords = (<any>records).length;
            let callbacksWaiting = numRecords;
            let errors: any[] = [];
            let callback = (err: any) => {
                callbacksWaiting--;
                if (err !== null && err !== undefined) {
                    (<any>errors).push(err);
                }
                if (callbacksWaiting === 0) {
                    if ((<any>errors).length > 0) {
                        cb(errors, null);
                    } else {
                        cb(null, null);
                    }
                }
            };
            for (let i = 0; i < numRecords; i++) {
                let item = records[i].Sns.Message;
                handler(item, callback);
            }
        });
        let invokePermission = new Permission(resName, {
            action: "lambda:invokeFunction",
            function: lambda.lambda,
            principal: "sns.amazonaws.com",
            sourceARN: this.topic.id,
        });
        let subscription = new Subscription(resName, {
            topic: this.topic,
            protocol: "lambda",
            endpoint: lambda.lambda.arn,
        });
        (<any>this.subscriptions).push(subscription);
    }
}
