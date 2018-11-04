//
const fs = require('fs');
const path = require('path');
const node_ssh = require('node-ssh');
const ssh = new node_ssh();

const AWS = require('aws-sdk');
AWS.config.loadFromPath('./config.json');
const ec2 = new AWS.EC2({apiVersion: '2016-11-15', region: 'us-west-2'});

// AMIs are region-specific
const instanceParams = {
  ImageId: 'ami-0bbe6b35405ecebdb',
  InstanceType: 't1.micro',
  KeyName: 'key_acs',
  MinCount: 1,
  MaxCount: 1
};

// main();


async function main() {

  const instance_details = await ec2.runInstances(instanceParams).promise();
  console.log(JSON.stringify(instance_details));

  const instance_id = instance_details.Instances[0].InstanceId;

  console.log('Waiting for Instance to be ready.  Please be patient...');

  const params = {InstanceIds: [instance_id]};
  const ready_instance = await waitForInstance(params);

  console.log(JSON.stringify(ready_instance));
  console.log('Instance Ready');

  const described = await describeInstance(params);
  const public_dns = described.Instances[0].PublicDnsName;
  console.log(public_dns);

}



async function waitForInstance(params) {
  return new Promise((resolve, reject) => {
    ec2.waitFor('instanceStatusOk', params, function (err, data) {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        resolve(data);
      }
    });
  })
}

async function describeInstance(params) {
  return new Promise((resolve, reject) => {
    ec2.describeInstances(params, function(err, data) {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        console.log(JSON.stringify(data));
        resolve(data);
      }
    });
  });
}

// TODO replace with public_dns variable

ssh.connect({
  host: 'ec2-52-25-247-120.us-west-2.compute.amazonaws.com',
  username: 'ubuntu',
  privateKey: '/home/daniel/Desktop/keys_credentials/key_acs.pem'
})
  .then(() => {
    console.log('Running...');
    return ssh.execCommand(
    `git clone https://github.com/Marhill-Labs/ec2-image-augmentation-pipeline.git &&
    cd ec2-image-augmentation-pipeline &&
    pip3 install boto3 Augmentor Pillow numpy &&
    python3 augmentor.py`);
  })
  .then(result => {
    console.log('STDOUT: ' + result.stdout);
    console.log('STDERR: ' + result.stderr);
    console.log("Done");
    ssh.dispose();
  })
  .catch(error => {
    console.log("Something's wrong");
    console.log(error);
    ssh.dispose();
  });


// sudo apt install -y python3-pip
// pip3 install numpy Pillow Augmentor

// installing nodejs only gets nodejs 8.1 (use nvm)
//
