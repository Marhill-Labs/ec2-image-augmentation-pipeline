//
const node_ssh = require('node-ssh');
const ssh = new node_ssh();

if(!process.argv[2] || !process.argv[3]) {
  console.log('Missing arguments for SAMPLES and/or CARD_SET');
  console.log('Example: node auto-ec2.js 100 3ed');
  process.exit();
}

const SAMPLES = process.argv[2];
const CARD_SET = process.argv[3];

console.log(`Initialized with ${SAMPLES} SAMPLEs, and ${CARD_SET} CARD_SET.`);


const AWS = require('aws-sdk');
AWS.config.loadFromPath('./config.json');
const ec2 = new AWS.EC2({apiVersion: '2016-11-15', region: 'us-west-2'});

// AMIs are region-specific
const instanceParams = {
  ImageId: 'ami-0bbe6b35405ecebdb',
  InstanceType: 't3.xlarge',
  KeyName: 'key_acs',
  MinCount: 1,
  MaxCount: 1
};

main();


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
  const public_dns = described.Reservations[0].Instances[0].PublicDnsName;
  console.log(public_dns);

  await shellCommands(public_dns);
  await terminateInstance(params);

  console.log('All Done!');
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

async function shellCommands(public_dns) {

  try {

    await ssh.connect({
      host: public_dns,
      username: 'ubuntu',
      privateKey: '/home/daniel/Desktop/keys_credentials/key_acs.pem'
    });

    const result = await ssh.execCommand(`git clone https://github.com/Marhill-Labs/ec2-image-augmentation-pipeline.git`);

    console.log(JSON.stringify(result));

    await ssh.putFile('config.json', '/home/ubuntu/ec2-image-augmentation-pipeline/config.json');

    console.log('Config copied.');
    console.log('Running...');

    const output = await ssh.exec(`sudo apt-get update && sudo apt-get install -y python3-pip && 
      pip3 install boto3 Augmentor Pillow numpy &&
      python3 augmentor.py`, [SAMPLES, CARD_SET, 'upload'], {
      cwd: '/home/ubuntu/ec2-image-augmentation-pipeline',
      onStdout(chunk) {
        console.log('stdoutChunk', chunk.toString('utf8'))
      },
      onStderr(chunk) {
        console.log('stderrChunk', chunk.toString('utf8'))
      }
    });

    console.log(typeof output);

    console.log(JSON.stringify(output));

    console.log("Finished");

  } catch(e) {
    // not sure why there is an error being thrown
    // convert to standard ssh library
  } finally {
    ssh.dispose();
  }


}


async function terminateInstance(params) {
  return new Promise((resolve, reject) => {
    ec2.terminateInstances(params, function(err, data) {
      if (err){
        console.log(err, err.stack);
        reject(err);
      } else {
        console.log(data);
        resolve('done');
      }
    });
  });
}