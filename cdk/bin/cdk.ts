#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkStack } from '../lib/cdk-stack';
import {ServiceConnectStack} from "../lib/service-connect-stack";

const app = new cdk.App();
// new CdkStack(app, 'CdkStack', {});
new ServiceConnectStack(app, 'ServiceConnectStack', {});
