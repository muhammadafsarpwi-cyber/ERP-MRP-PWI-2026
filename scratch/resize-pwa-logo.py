import os
from PIL import Image

def generate_icons():
    src_path = 'frontend/public/logo.png'
    backup_path = 'frontend/public/logo_original_backup.png'
    
    if not os.path.exists(backup_path):
        # Save a backup of the original
        orig = Image.open(src_path)
        orig.save(backup_path)
        print(f"Backed up original logo to {backup_path}")
    else:
        orig = Image.open(backup_path)

    orig = orig.convert('RGBA')
    
    # Crop the logo tightly around its content
    # Non-white / non-transparent bounding box with 2px anti-aliasing padding
    w, h = orig.size
    min_x, min_y, max_x, max_y = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = orig.getpixel((x, y))
            if a > 10 and not (r > 248 and g > 248 and b > 248):
                if x < min_x: min_x = x
                if x > max_x: max_x = x
                if y < min_y: min_y = y
                if y > max_y: max_y = y

    # Safe crop bounds
    crop_x1 = max(0, min_x - 3)
    crop_y1 = max(0, min_y - 3)
    crop_x2 = min(w, max_x + 4)
    crop_y2 = min(h, max_y + 4)
    
    cropped_logo = orig.crop((crop_x1, crop_y1, crop_x2, crop_y2))
    cw, ch = cropped_logo.size
    print(f"Cropped logo content size: {cw}x{ch}")

    # Scale ratio: logo should occupy ~70% of target canvas (giving 15% safe padding all around)
    scale_factor = 0.70

    targets = [
        ('frontend/public/logo.png', 512),
        ('frontend/public/logo512.png', 512),
        ('frontend/public/logo192.png', 192),
        ('frontend/public/apple-touch-icon.png', 180),
        ('frontend/public/logo-mark.png', 64),
        ('frontend/build/logo.png', 512),
        ('frontend/build/logo512.png', 512),
        ('frontend/build/logo192.png', 192),
        ('frontend/build/apple-touch-icon.png', 180),
        ('frontend/build/logo-mark.png', 64),
    ]

    for dest_path, canvas_size in targets:
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        # Create pure white square canvas
        canvas = Image.new('RGBA', (canvas_size, canvas_size), (255, 255, 255, 255))
        
        # Calculate target logo dimensions preserving aspect ratio
        logo_target_size = int(canvas_size * scale_factor)
        aspect = cw / ch
        if aspect >= 1.0:
            target_w = logo_target_size
            target_h = int(logo_target_size / aspect)
        else:
            target_h = logo_target_size
            target_w = int(logo_target_size * aspect)
            
        resized_logo = cropped_logo.resize((target_w, target_h), Image.Resampling.LANCZOS)
        
        # Center in canvas
        offset_x = (canvas_size - target_w) // 2
        offset_y = (canvas_size - target_h) // 2
        
        # Paste with alpha mask
        canvas.paste(resized_logo, (offset_x, offset_y), resized_logo)
        
        # Save as PNG
        canvas.save(dest_path, 'PNG', optimize=True)
        print(f"Generated {dest_path} ({canvas_size}x{canvas_size}, logo size {target_w}x{target_h}, padding ~{(canvas_size - target_w)//2}px)")

    # Also generate favicon.ico with multiple sizes
    ico_canvas = Image.new('RGBA', (256, 256), (255, 255, 255, 255))
    ico_logo_size = int(256 * scale_factor)
    aspect = cw / ch
    if aspect >= 1.0:
        iw = ico_logo_size
        ih = int(ico_logo_size / aspect)
    else:
        ih = ico_logo_size
        iw = int(ico_logo_size * aspect)
    ico_resized = cropped_logo.resize((iw, ih), Image.Resampling.LANCZOS)
    ico_canvas.paste(ico_resized, ((256 - iw) // 2, (256 - ih) // 2), ico_resized)
    ico_canvas.save('frontend/public/favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    if os.path.exists('frontend/build'):
        ico_canvas.save('frontend/build/favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("Generated favicon.ico with 16, 32, 48, 64 resolutions.")

if __name__ == '__main__':
    generate_icons()
