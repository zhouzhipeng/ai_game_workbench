import os
import sys
from pathlib import Path

from PIL import Image


def choose_device():
    requested = os.environ.get("BIREFNET_DEVICE", "auto").strip().lower()
    if requested and requested != "auto":
        return requested
    import torch

    return "cuda" if torch.cuda.is_available() else "cpu"


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: birefnet_matting.py <input.png|input_dir> <output.png|output_dir>")

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    model_id = os.environ.get("BIREFNET_MODEL_ID", "ZhengPeng7/BiRefNet")
    input_size = int(os.environ.get("BIREFNET_INPUT_SIZE", "512"))

    import torch
    from torchvision import transforms
    from transformers import AutoModelForImageSegmentation

    device = choose_device()
    model = AutoModelForImageSegmentation.from_pretrained(model_id, trust_remote_code=True)
    model.to(device)
    if device == "cpu":
        model.float()
    model.eval()
    model_dtype = next(model.parameters()).dtype

    transform = transforms.Compose([
        transforms.Resize((input_size, input_size)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    to_pil = transforms.ToPILImage()

    if input_path.is_dir():
        output_path.mkdir(parents=True, exist_ok=True)
        items = sorted([path for path in input_path.iterdir() if path.suffix.lower() in [".png", ".jpg", ".jpeg", ".webp"]])
        for item in items:
            matte_one(item, output_path / f"{item.stem}.png", model, transform, to_pil, device, model_dtype, torch)
    else:
        matte_one(input_path, output_path, model, transform, to_pil, device, model_dtype, torch)


def matte_one(input_path, output_path, model, transform, to_pil, device, model_dtype, torch):
    image = Image.open(input_path).convert("RGB")
    tensor = transform(image).unsqueeze(0).to(device=device, dtype=model_dtype)
    with torch.no_grad():
        output = model(tensor)
        if isinstance(output, (list, tuple)):
            prediction = output[-1]
        elif hasattr(output, "logits"):
            prediction = output.logits
        else:
            prediction = output
        prediction = prediction.sigmoid().detach().cpu()[0].squeeze()
    mask = to_pil(prediction).resize(image.size, Image.Resampling.LANCZOS)
    result = image.convert("RGBA")
    result.putalpha(mask)
    result.save(output_path)


if __name__ == "__main__":
    main()
