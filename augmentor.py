import Augmentor
from Augmentor.Operations import Operation
import PIL
import numpy as np
import random
import sys
import boto3
import os
import shutil
import json

with open('config.json') as f:
    credentials = json.load(f)

s3 = boto3.resource('s3', aws_access_key_id=credentials["accessKeyId"], aws_secret_access_key=credentials["secretAccessKey"])

default_samples = 10 # Any number
default_card_set = "3ed"
import_folder = "import"
export_folder = "export"
upload = False
IMPORT_BUCKET = 'mtg-cards-medium'

if len(sys.argv) > 1:
    print("Samples: ", sys.argv[1])
    samples = int(sys.argv[1])
else:
    print("Default Samples: ", default_samples)
    samples = default_samples

if len(sys.argv) > 2:
    print("Card Set: ", sys.argv[2])
    card_set = sys.argv[2]
else:
    print("Default Card Set: ", default_card_set)
    card_set = default_card_set

if len(sys.argv) > 3 and sys.argv[3] == "upload":
    print("Files will be uploaded to S3")
    upload = True
else:
    print("Files will NOT be uploaded to S3")
    upload = False


# create import/export folders if remote
try:
    os.mkdir(import_folder)
    print("Import Directory " , import_folder ,  " Created")
except FileExistsError:
    print("Import Directory " , import_folder ,  " already exists")

# delete export dir
try:
    shutil.rmtree("export")
    print("Export Directory " , export_folder ,  " Removed")
except FileNotFoundError:
    print("Export Directory " , export_folder ,  " doesn't exist")

os.mkdir(export_folder)
print("Export Directory " , export_folder ,  " Created")

my_bucket = s3.Bucket(IMPORT_BUCKET)

print("Scanning AWS Bucket for Images to Download")

# download card files
for object in my_bucket.objects.all():
    path, filename = os.path.split(object.key)
    if path == card_set:
        if os.path.exists(import_folder + "/" + filename) == False:
            my_bucket.download_file(object.key, import_folder + "/" + filename)

print("Done downloading Images")

print("Starting Image Augmentation")

class SpeckleImage(Operation):
    def __init__(self, probability):
        Operation.__init__(self, probability)

    def perform_operation(self, images):
        arr = []
        for item in images:
            im = item.convert('RGBA')
            data = np.array(im)
            for row_idx, row in enumerate(data):
                for cell_idx, cell in enumerate(row):
                    if cell[0] == 0 and cell[1] == 0 and cell[2] == 0:
                        rnd_r = random.randint(1,255)
                        rnd_g = random.randint(1,255)
                        rnd_b = random.randint(1,255)
                        data[row_idx, cell_idx] = (rnd_r, rnd_g, rnd_b, 255)
            i = PIL.Image.fromarray(data)
            rgb_im = i.convert('RGB')
            arr.append(rgb_im)
        return arr

class TouchGrey(Operation):
    def __init__(self, probability):
        Operation.__init__(self, probability)

    def perform_operation(self, images):
        arr = []
        for item in images:
            im = item.convert('RGBA')
            data = np.array(im)
            for row_idx, row in enumerate(data):
                for cell_idx, cell in enumerate(row):
                    red, green, blue, a = cell
                    if (int(red) + int(green) + int(blue)) < 3:
                        data[row_idx, cell_idx] = (1, 1, 1, 255)
            i = PIL.Image.fromarray(data)
            rgb_im = i.convert('RGB')
            arr.append(rgb_im)
        return arr

speckle_image = SpeckleImage(probability = 1)
touch_grey = TouchGrey(probability = 1)


p = Augmentor.Pipeline(source_directory=import_folder, output_directory="../" + export_folder)
p.add_operation(touch_grey)
p.random_brightness(probability=0.9, min_factor=0.65, max_factor=1.4)
p.resize(probability=1, width=610, height=800, resample_filter=u'BICUBIC')
p.zoom(probability=1, min_factor=0.55, max_factor=0.55)
p.rotate_without_crop(probability=1, max_left_rotation=90, max_right_rotation=90)
p.skew(probability=0.8, magnitude=0.15)
p.zoom(probability=1, min_factor=0.5, max_factor=1)
p.crop_by_size(probability=1, width=610, height=610, centre=True)
p.resize(probability=0.5, width=300, height=300, resample_filter=u'BILINEAR')
p.resize(probability=1, width=400, height=400, resample_filter=u'BICUBIC')
p.add_operation(speckle_image)
p.sample(samples)

if upload == True:
    # upload generated images back to S3
    try:
        s3.create_bucket(CreateBucketConfiguration={'LocationConstraint': 'us-west-2'}, Bucket="mtg-train-" + card_set)
        print("\nSuccessfully created Bucket: " + "mtg-train-" + card_set)
    except:
        print("\nBucket " + "mtg-train-" + card_set + " already exists")

    counter = 0

    for filename in os.listdir(export_folder):
        counter+=1
        slice = filename.split("_")[2:]
        file_short = "_".join(slice)
        print(str((counter/samples)*100.0) + "%", "  uploading ", file_short)
        s3.meta.client.upload_file(export_folder + "/" + filename, "mtg-train-" + card_set, file_short)

sys.exit(0)