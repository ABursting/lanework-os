"""Draw the eval suite's sample screenshots. Every name in them is invented.

Run once with `python3 evals/make-screenshots.py`; the PNGs are committed, so
this only needs re-running if a sample changes.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent / "screenshots"
OUT.mkdir(exist_ok=True)

def font(size, bold=False):
    for name in (["Arial Bold.ttf", "Helvetica-Bold.ttf"] if bold else ["Arial.ttf", "Helvetica.ttc"]):
        for base in ("/System/Library/Fonts/Supplemental/", "/System/Library/Fonts/", "/Library/Fonts/"):
            try:
                return ImageFont.truetype(base + name, size)
            except OSError:
                pass
    return ImageFont.load_default()

def email(path, lines):
    img = Image.new("RGB", (1400, 560), "white")
    d = ImageDraw.Draw(img)
    y = 40
    for text in lines:
        d.text((40, y), text, fill=(34, 34, 34), font=font(28))
        y += 52 if text else 26
    img.save(OUT / path)

email("confirmation-email.png", [
    "Dear Jamie,",
    "",
    "Thank you for your interest in our Strategy Associate opportunity at Kestrel Partners.",
    "Your application has been received and we will review it within the next two weeks.",
    "",
    "We will be in touch to either schedule next steps or let you know the outcome.",
    "",
    "Best regards,",
    "Kestrel Partners Talent Team",
])

email("rejection-email.png", [
    "Dear Jamie,",
    "",
    "Thank you for applying to the Investment Analyst position at Brightline Capital.",
    "After careful review, we have decided to move forward with other candidates.",
    "",
    "We wish you the best in your search.",
    "",
    "Brightline Capital Recruiting",
])

# A saved-jobs page: three listings, one with a deadline, one with a posting age,
# and one that the fictional CRM already tracks.
img = Image.new("RGB", (1200, 900), (243, 242, 239))
d = ImageDraw.Draw(img)
d.text((40, 30), "Saved jobs (3)", fill=(20, 20, 20), font=font(34, bold=True))
cards = [
    ("Orbital Freight", "Operations Analyst", "Chicago, IL · Apply by Nov 3"),
    ("Tidewater Energy", "Junior Data Scientist", "Houston, TX · Posted 2 weeks ago"),
    ("Brightline Capital", "Investment Analyst", "New York, NY · 30+ days ago"),
]
y = 110
for company, role, meta in cards:
    d.rounded_rectangle((40, y, 1160, y + 220), radius=14, fill="white", outline=(220, 220, 220))
    d.text((70, y + 30), role, fill=(10, 102, 194), font=font(32, bold=True))
    d.text((70, y + 88), company, fill=(30, 30, 30), font=font(28))
    d.text((70, y + 140), meta, fill=(100, 100, 100), font=font(24))
    y += 250
img.save(OUT / "saved-jobs.png")
print("wrote", sorted(p.name for p in OUT.glob("*.png")))
