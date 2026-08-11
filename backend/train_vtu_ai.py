import os
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from PIL import Image
import glob

# --- Configuration ---
IMG_W, IMG_H = 150, 50
CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
CHAR_MAP = {c: i for i, c in enumerate(CHARSET)}
REV_MAP = {i: c for i, c in enumerate(CHARSET)}
LABEL_LEN = 6

class CaptchaModel(nn.Module):
    def __init__(self):
        super(CaptchaModel, self).__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(1, 32, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(64, 128, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2)
        )
        self.fc = nn.Linear(128 * (IMG_W // 8) * (IMG_H // 8), 512)
        self.out = nn.Linear(512, LABEL_LEN * len(CHARSET))

    def forward(self, x):
        x = self.conv(x)
        x = x.view(x.size(0), -1)
        x = self.fc(x)
        x = self.out(x)
        return x.view(-1, LABEL_LEN, len(CHARSET))

class VTUDataset(Dataset):
    def __init__(self, data_dir):
        self.files = glob.glob(os.path.join(data_dir, "*.png"))
        self.transform = transforms.Compose([
            transforms.Grayscale(),
            transforms.Resize((IMG_H, IMG_W)),
            transforms.ToTensor()
        ])

    def __len__(self): return len(self.files)

    def __getitem__(self, idx):
        img_path = self.files[idx]
        label_text = os.path.basename(img_path).split('_')[0]
        image = self.transform(Image.open(img_path))
        label = torch.zeros(LABEL_LEN, dtype=torch.long)
        for i, char in enumerate(label_text[:LABEL_LEN]):
            label[i] = CHAR_MAP.get(char, 0)
        return image, label

def train():
    data_dir = "backend/training_data"
    if not os.path.exists(data_dir) or len(os.listdir(data_dir)) < 10:
        print(f"❌ Error: Not enough data in {data_dir}. Collect at least 10 images first.")
        return

    dataset = VTUDataset(data_dir)
    loader = DataLoader(dataset, batch_size=8, shuffle=True)
    
    model = CaptchaModel()
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=0.001)

    print("🚀 Starting Training...")
    for epoch in range(50):
        total_loss = 0
        for i, (imgs, labels) in enumerate(loader):
            optimizer.zero_grad()
            outputs = model(imgs)
            loss = 0
            for j in range(LABEL_LEN):
                loss += criterion(outputs[:, j, :], labels[:, j])
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
        
        if (epoch+1) % 10 == 0:
            print(f"Epoch [{epoch+1}/50], Loss: {total_loss/len(loader):.4f}")

    torch.save(model.state_dict(), "vtu_captcha_model.pth")
    print("✅ Training Complete! Model saved as 'vtu_captcha_model.pth'")

if __name__ == "__main__":
    train()
