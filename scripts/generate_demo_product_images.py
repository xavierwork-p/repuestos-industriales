from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "public" / "demo-products"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def font(size, bold=False):
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
    ]

    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue

    return ImageFont.load_default()


TITLE_FONT = font(44, True)
SUBTITLE_FONT = font(24)
CODE_FONT = font(20, True)


def rounded_rect(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def draw_header(draw, title, code, accent):
    draw.text((58, 54), title, fill="#111827", font=TITLE_FONT)
    rounded_rect(draw, (58, 120, 245, 158), 18, accent)
    draw.text((76, 128), code, fill="#ffffff", font=CODE_FONT)


def base_canvas(title, code, accent):
    image = Image.new("RGB", (1200, 900), "#f8fafc")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1200, 900), fill="#f8fafc")
    draw.rectangle((0, 720, 1200, 900), fill="#e5e7eb")
    rounded_rect(draw, (40, 35, 1160, 865), 34, "#ffffff", "#d1d5db", 2)
    draw_header(draw, title, code, accent)
    return image, draw


def save(image, filename):
    image.save(OUTPUT_DIR / filename, optimize=True)


def pump():
    image, draw = base_canvas("Bomba centrifuga", "REP-BC-150", "#2563eb")
    draw.ellipse((405, 255, 775, 625), fill="#dbeafe", outline="#1d4ed8", width=18)
    draw.ellipse((485, 335, 695, 545), fill="#93c5fd", outline="#1e40af", width=12)
    draw.ellipse((548, 398, 632, 482), fill="#1e40af")
    rounded_rect(draw, (750, 382, 1015, 500), 22, "#bfdbfe", "#1d4ed8", 12)
    rounded_rect(draw, (250, 390, 428, 492), 20, "#bfdbfe", "#1d4ed8", 12)
    rounded_rect(draw, (430, 620, 760, 690), 18, "#334155")
    rounded_rect(draw, (360, 685, 830, 735), 16, "#64748b")
    draw.arc((520, 370, 660, 510), 20, 330, fill="#eff6ff", width=20)
    draw.text((58, 792), "Equipo de bombeo industrial para demo", fill="#475569", font=SUBTITLE_FONT)
    save(image, "bomba-centrifuga.png")


def bearing():
    image, draw = base_canvas("Rodamiento sellado", "REP-ROD-6205", "#0891b2")
    draw.ellipse((390, 225, 810, 645), fill="#cffafe", outline="#0e7490", width=24)
    draw.ellipse((505, 340, 695, 530), fill="#ffffff", outline="#155e75", width=18)
    for x, y in [
        (500, 275), (610, 260), (720, 310), (760, 420),
        (715, 535), (605, 585), (490, 545), (440, 430),
    ]:
        draw.ellipse((x, y, x + 62, y + 62), fill="#67e8f9", outline="#155e75", width=8)
    draw.text((58, 792), "Rodamiento radial para motores y transportadores", fill="#475569", font=SUBTITLE_FONT)
    save(image, "rodamiento-6205.png")


def belt():
    image, draw = base_canvas("Correa tipo V", "REP-COR-A42", "#7c3aed")
    draw.ellipse((330, 300, 570, 610), fill="#ede9fe", outline="#4c1d95", width=26)
    draw.ellipse((640, 260, 900, 650), fill="#ede9fe", outline="#4c1d95", width=26)
    rounded_rect(draw, (455, 280, 770, 630), 64, "#6d28d9", "#4c1d95", 14)
    rounded_rect(draw, (510, 345, 715, 565), 48, "#ffffff", "#ddd6fe", 6)
    draw.line((430, 340, 825, 312), fill="#c4b5fd", width=10)
    draw.line((432, 575, 830, 612), fill="#c4b5fd", width=10)
    draw.text((58, 792), "Correa demo para transmision mecanica", fill="#475569", font=SUBTITLE_FONT)
    save(image, "correa-a42.png")


def sensor():
    image, draw = base_canvas("Sensor inductivo", "REP-SEN-M18", "#059669")
    rounded_rect(draw, (365, 355, 820, 505), 34, "#d1fae5", "#047857", 16)
    rounded_rect(draw, (790, 380, 965, 480), 24, "#a7f3d0", "#047857", 12)
    rounded_rect(draw, (245, 383, 390, 477), 24, "#e2e8f0", "#475569", 10)
    for x in range(402, 772, 48):
      draw.line((x, 358, x - 26, 504), fill="#10b981", width=5)
    draw.ellipse((913, 408, 944, 439), fill="#064e3b")
    draw.line((965, 430, 1070, 430), fill="#111827", width=12)
    draw.text((58, 792), "Sensor de proximidad para automatizacion", fill="#475569", font=SUBTITLE_FONT)
    save(image, "sensor-m18.png")


def valve():
    image, draw = base_canvas("Valvula de bola", "REP-VAL-100", "#ea580c")
    rounded_rect(draw, (300, 390, 900, 520), 34, "#fed7aa", "#c2410c", 16)
    draw.ellipse((475, 300, 725, 610), fill="#ffedd5", outline="#c2410c", width=18)
    draw.ellipse((540, 372, 660, 492), fill="#fb923c", outline="#9a3412", width=10)
    rounded_rect(draw, (520, 235, 680, 300), 18, "#9a3412")
    rounded_rect(draw, (410, 190, 790, 245), 18, "#f97316")
    draw.line((310, 455, 465, 455), fill="#9a3412", width=10)
    draw.line((735, 455, 890, 455), fill="#9a3412", width=10)
    draw.text((58, 792), "Valvula inox para lineas de fluidos", fill="#475569", font=SUBTITLE_FONT)
    save(image, "valvula-bola.png")


def contactor():
    image, draw = base_canvas("Contactor 32A", "REP-CON-32A", "#dc2626")
    rounded_rect(draw, (390, 230, 810, 660), 32, "#fee2e2", "#991b1b", 16)
    rounded_rect(draw, (455, 300, 745, 390), 18, "#ffffff", "#ef4444", 8)
    rounded_rect(draw, (455, 455, 745, 585), 18, "#fecaca", "#b91c1c", 8)
    for x in [455, 550, 645, 740]:
        draw.line((x, 215, x, 180), fill="#374151", width=14)
        draw.line((x, 660, x, 705), fill="#374151", width=14)
    draw.text((535, 480), "32A", fill="#991b1b", font=TITLE_FONT)
    draw.text((58, 792), "Componente de control electrico para demo", fill="#475569", font=SUBTITLE_FONT)
    save(image, "contactor-32a.png")


def cylinder():
    image, draw = base_canvas("Cilindro neumatico", "REP-CIL-50100", "#0f766e")
    rounded_rect(draw, (330, 365, 850, 535), 42, "#ccfbf1", "#0f766e", 16)
    rounded_rect(draw, (240, 395, 345, 505), 24, "#99f6e4", "#115e59", 12)
    rounded_rect(draw, (835, 390, 940, 510), 24, "#99f6e4", "#115e59", 12)
    draw.line((940, 450, 1070, 450), fill="#475569", width=18)
    rounded_rect(draw, (1050, 420, 1125, 480), 18, "#64748b")
    for x in [380, 800]:
        draw.ellipse((x, 407, x + 84, 491), fill="#f0fdfa", outline="#115e59", width=8)
    draw.text((58, 792), "Actuador neumatico para automatizacion", fill="#475569", font=SUBTITLE_FONT)
    save(image, "cilindro-neumatico.png")


def filter_cart():
    image, draw = base_canvas("Filtro cartucho", "REP-FIL-10M", "#4f46e5")
    rounded_rect(draw, (430, 215, 770, 665), 48, "#e0e7ff", "#3730a3", 16)
    rounded_rect(draw, (485, 160, 715, 235), 26, "#c7d2fe", "#3730a3", 12)
    rounded_rect(draw, (485, 645, 715, 720), 26, "#c7d2fe", "#3730a3", 12)
    for x in range(485, 720, 38):
        draw.line((x, 255, x - 45, 625), fill="#818cf8", width=8)
    for x in range(520, 755, 38):
        draw.line((x, 255, x - 45, 625), fill="#ffffff", width=5)
    draw.text((58, 792), "Filtro de mantenimiento preventivo", fill="#475569", font=SUBTITLE_FONT)
    save(image, "filtro-cartucho.png")


if __name__ == "__main__":
    pump()
    bearing()
    belt()
    sensor()
    valve()
    contactor()
    cylinder()
    filter_cart()
    print(f"Generated product images in {OUTPUT_DIR}")
