"""
BCD Backend — tools/finetune_efficientnet.py
Phase 6 – Fine-tuning EfficientNetV2-S on breast imaging datasets.

PURPOSE
-------
This is an OFFLINE training script.  Run it locally on a machine with GPU
access and the datasets downloaded; it is NOT executed at server startup.

Produced output:
  backend/models/efficientnet_v2_s_finetuned.pth

The backend's embedding.py loads this file automatically when it exists.

DATASETS SUPPORTED
------------------
1. BreastMNIST (medmnist package — auto-downloads ~20 MB)
     pip install medmnist
     python finetune_efficientnet.py --dataset breastmnist

2. CBIS-DDSM / INBreast — folder layout expected:
     data/cbis_ddsm/
       benign/   *.png or *.jpg
       malignant/
     data/inbreast/
       benign/
       malignant/

   python finetune_efficientnet.py --dataset cbis_ddsm --data-dir data/cbis_ddsm

APPROACH
--------
Fine-tuning strategy: supervised classification (binary: benign / malignant).

Steps:
  1. Load pre-trained EfficientNetV2-S (ImageNet weights).
  2. Keep the original classifier head during fine-tuning (adds a 2-class
     output layer on top of the 1280-dim features).
  3. Train with a low learning rate for the backbone; higher for the head.
  4. After training, REMOVE the classification head (set to Identity) and
     save only the feature extractor weights.

The saved checkpoint can be loaded by embedding.py to improve embedding
quality for breast tissue images.

USAGE
-----
From the backend/ directory:

  # BreastMNIST (auto-download):
  python tools/finetune_efficientnet.py --dataset breastmnist --epochs 10

  # Custom folder dataset:
  python tools/finetune_efficientnet.py \\
      --dataset folder \\
      --data-dir data/cbis_ddsm \\
      --epochs 20 \\
      --batch-size 16

REQUIREMENTS
------------
  torch>=2.1.0
  torchvision>=0.16.0
  medmnist          (only needed for --dataset breastmnist)

All of the above should already be present in the venv for torch/torchvision.
Install medmnist separately: pip install medmnist
"""

import argparse
import logging
import os
import sys
from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim
import torchvision.models as models
import torchvision.transforms as transforms
from torch.utils.data import DataLoader

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).parent.resolve()
BACKEND_DIR = SCRIPT_DIR.parent
MODELS_DIR = BACKEND_DIR / "models"
WEIGHTS_PATH = MODELS_DIR / "efficientnet_v2_s_finetuned.pth"

MODELS_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Transforms
# ---------------------------------------------------------------------------

TRAIN_TRANSFORMS = transforms.Compose([
    transforms.Resize((256, 256)),
    transforms.RandomCrop(224),
    transforms.RandomHorizontalFlip(),
    transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.1),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])

VAL_TRANSFORMS = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])


# ---------------------------------------------------------------------------
# Dataset loaders
# ---------------------------------------------------------------------------

def load_breastmnist(batch_size: int):
    """Load BreastMNIST via the medmnist package (auto-downloads data)."""
    try:
        import medmnist
        from medmnist import BreastMNIST
    except ImportError:
        logger.error(
            "medmnist is not installed. Run: pip install medmnist"
        )
        sys.exit(1)

    # BreastMNIST images are 28×28 greyscale.  We'll upscale + convert to RGB.
    breastmnist_transforms = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.Grayscale(num_output_channels=3),   # greyscale → RGB
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406],
                             std=[0.229, 0.224, 0.225]),
    ])

    train_ds = BreastMNIST(
        split="train", transform=breastmnist_transforms, download=True)
    val_ds = BreastMNIST(
        split="val",   transform=breastmnist_transforms, download=True)

    train_loader = DataLoader(
        train_ds, batch_size=batch_size, shuffle=True, num_workers=2)
    val_loader = DataLoader(
        val_ds,   batch_size=batch_size, shuffle=False, num_workers=2)

    # BreastMNIST: 0 = malignant, 1 = normal/benign → 2 classes
    num_classes = 2
    logger.info("BreastMNIST: %d train / %d val samples",
                len(train_ds), len(val_ds))
    return train_loader, val_loader, num_classes


def load_folder_dataset(data_dir: str, batch_size: int):
    """
    Load a folder-organised dataset:
      data_dir/
        <class_a>/  *.jpg / *.png
        <class_b>/
        ...

    Classes are inferred from subfolder names.
    """
    from torchvision.datasets import ImageFolder

    data_path = Path(data_dir)
    if not data_path.exists():
        logger.error("Data directory not found: %s", data_dir)
        sys.exit(1)

    full_ds = ImageFolder(str(data_path), transform=TRAIN_TRANSFORMS)
    n = len(full_ds)
    val_n = max(1, int(n * 0.15))
    train_n = n - val_n

    train_ds, val_ds = torch.utils.data.random_split(full_ds, [train_n, val_n])

    # Val split should use VAL_TRANSFORMS — wrap with a new dataset view
    val_ds_with_transform = _TransformedSubset(
        full_ds, val_ds.indices, VAL_TRANSFORMS)

    train_loader = DataLoader(
        train_ds, batch_size=batch_size, shuffle=True, num_workers=2)
    val_loader = DataLoader(val_ds_with_transform,
                            batch_size=batch_size, shuffle=False, num_workers=2)

    num_classes = len(full_ds.classes)
    logger.info(
        "Folder dataset: %d classes, %d train / %d val — classes: %s",
        num_classes, train_n, val_n, full_ds.classes,
    )
    return train_loader, val_loader, num_classes


class _TransformedSubset(torch.utils.data.Dataset):
    """Applies a different transform to a subset of an ImageFolder dataset."""

    def __init__(self, base_dataset, indices, transform):
        self.base_dataset = base_dataset
        self.indices = indices
        self.transform = transform

    def __len__(self):
        return len(self.indices)

    def __getitem__(self, idx):
        img, label = self.base_dataset.imgs[self.indices[idx]]
        from PIL import Image
        image = Image.open(img).convert("RGB")
        return self.transform(image), label


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def build_model(num_classes: int, device: str) -> nn.Module:
    """
    EfficientNetV2-S with a binary (or multi-class) fine-tuning head.
    The backbone is loaded with ImageNet weights and kept largely frozen;
    only the last two feature blocks + the head are trained.
    """
    model = models.efficientnet_v2_s(
        weights=models.EfficientNet_V2_S_Weights.DEFAULT)

    # Freeze all backbone layers first
    for param in model.parameters():
        param.requires_grad = False

    # Unfreeze the last two feature stages + the final avgpool
    # EfficientNetV2-S features is a Sequential of 7 stages (indices 0-6)
    for param in model.features[5:].parameters():
        param.requires_grad = True

    # Replace classifier head for fine-tuning
    in_features = model.classifier[1].in_features
    model.classifier = nn.Sequential(
        nn.Dropout(p=0.3),
        nn.Linear(in_features, num_classes),
    )

    model.to(device)
    return model


def train_one_epoch(model, loader, criterion, optimizer, device, epoch):
    model.train()
    total_loss = 0.0
    correct = 0
    total = 0

    for batch_idx, (images, labels) in enumerate(loader):
        # medmnist labels are shape (N, 1) — flatten to (N,)
        if labels.dim() > 1:
            labels = labels.squeeze(1)

        images = images.to(device)
        labels = labels.long().to(device)

        optimizer.zero_grad()
        outputs = model(images)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()

        total_loss += loss.item() * images.size(0)
        _, predicted = outputs.max(1)
        correct += predicted.eq(labels).sum().item()
        total += images.size(0)

        if (batch_idx + 1) % 20 == 0:
            logger.info(
                "  Epoch %d  step %d/%d  loss=%.4f  acc=%.2f%%",
                epoch, batch_idx + 1, len(loader),
                total_loss / total, 100.0 * correct / total,
            )

    return total_loss / total, 100.0 * correct / total


@torch.no_grad()
def evaluate(model, loader, criterion, device):
    model.eval()
    total_loss = 0.0
    correct = 0
    total = 0

    for images, labels in loader:
        if labels.dim() > 1:
            labels = labels.squeeze(1)

        images = images.to(device)
        labels = labels.long().to(device)

        outputs = model(images)
        loss = criterion(outputs, labels)
        total_loss += loss.item() * images.size(0)
        _, predicted = outputs.max(1)
        correct += predicted.eq(labels).sum().item()
        total += images.size(0)

    return total_loss / total, 100.0 * correct / total


def save_feature_extractor(model, path: Path):
    """
    Remove the fine-tuning classification head, restore Identity,
    and save the feature-extractor state_dict.

    This is the format embedding.py expects.
    """
    model.classifier = nn.Identity()
    torch.save(model.state_dict(), str(path))
    logger.info("Saved feature-extractor weights to: %s", path)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Fine-tune EfficientNetV2-S for breast imaging."
    )
    parser.add_argument(
        "--dataset",
        choices=["breastmnist", "folder"],
        default="breastmnist",
        help="Dataset to use: breastmnist (auto-download) or folder (--data-dir required).",
    )
    parser.add_argument(
        "--data-dir",
        type=str,
        default=None,
        help="Path to folder dataset directory (required when --dataset=folder).",
    )
    parser.add_argument("--epochs",     type=int, default=10,
                        help="Training epochs (default: 10).")
    parser.add_argument("--batch-size", type=int, default=32,
                        help="Batch size (default: 32).")
    parser.add_argument("--lr",         type=float, default=1e-4,
                        help="Learning rate for unfrozen layers.")
    parser.add_argument("--head-lr",    type=float, default=1e-3,
                        help="Learning rate for classifier head.")
    parser.add_argument("--output",     type=str, default=str(WEIGHTS_PATH),
                        help="Output path for saved weights.")
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info("Device: %s", device)
    logger.info("Output: %s", args.output)

    # Load dataset
    if args.dataset == "breastmnist":
        train_loader, val_loader, num_classes = load_breastmnist(
            args.batch_size)
    else:
        if not args.data_dir:
            parser.error("--data-dir is required when --dataset=folder")
        train_loader, val_loader, num_classes = load_folder_dataset(
            args.data_dir, args.batch_size)

    # Build model
    model = build_model(num_classes, device)
    logger.info("Model: EfficientNetV2-S, %d output classes", num_classes)

    # Optimiser: different LR for backbone vs head
    backbone_params = [p for n, p in model.named_parameters(
    ) if "classifier" not in n and p.requires_grad]
    head_params = list(model.classifier.parameters())

    optimizer = optim.AdamW([
        {"params": backbone_params, "lr": args.lr},
        {"params": head_params,     "lr": args.head_lr},
    ], weight_decay=1e-4)

    scheduler = optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=args.epochs)
    criterion = nn.CrossEntropyLoss()

    best_val_acc = 0.0

    for epoch in range(1, args.epochs + 1):
        train_loss, train_acc = train_one_epoch(
            model, train_loader, criterion, optimizer, device, epoch)
        val_loss, val_acc = evaluate(model, val_loader, criterion, device)
        scheduler.step()

        logger.info(
            "Epoch %d/%d  train_loss=%.4f  train_acc=%.2f%%  val_loss=%.4f  val_acc=%.2f%%",
            epoch, args.epochs, train_loss, train_acc, val_loss, val_acc,
        )

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            # Save best model checkpoint (with head still attached for training)
            checkpoint_path = Path(args.output).with_suffix(".ckpt.pth")
            torch.save(model.state_dict(), str(checkpoint_path))
            logger.info(
                "  ↑ New best val_acc=%.2f%% — checkpoint saved", val_acc)

    # Load best checkpoint and save as feature extractor
    if checkpoint_path.exists():
        model.load_state_dict(torch.load(
            str(checkpoint_path), map_location=device))
        logger.info("Loaded best checkpoint (val_acc=%.2f%%)", best_val_acc)

    save_feature_extractor(model, Path(args.output))
    logger.info(
        "Fine-tuning complete. Best validation accuracy: %.2f%%", best_val_acc)
    logger.info(
        "\nTo use: copy '%s' to 'backend/models/'.\n"
        "The server will load it automatically on next startup.",
        args.output,
    )


if __name__ == "__main__":
    main()
