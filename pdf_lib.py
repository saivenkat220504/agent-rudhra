import os
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from pypdf import PdfReader, PdfWriter
import io

def append_to_pdf(file_path: str, title: str, content: str, question: str = None):
    """
    Appends content to an existing PDF or creates a new one if it doesn't exist.
    Uses reportlab to generate the new content and pypdf to merge it.
    """
    # 1. Ensure directory exists
    dir_path = os.path.dirname(file_path)
    if dir_path and not os.path.exists(dir_path):
        os.makedirs(dir_path)

    # 2. Generate the new content PDF in memory
    packet = io.BytesIO()
    doc = SimpleDocTemplate(packet, pagesize=letter)
    styles = getSampleStyleSheet()
    
    # Custom style for the message block
    story = []
    
    # Header for the entry
    story.append(Paragraph(f"<b>Log Entry: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</b>", styles['Normal']))
    story.append(Spacer(1, 12))
    
    # Question (if provided)
    if question:
        story.append(Paragraph("<b>Question:</b>", styles['Normal']))
        safe_question = question.replace('\n', '<br/>')
        story.append(Paragraph(safe_question, styles['Normal']))
        story.append(Spacer(1, 12))

    # The actual content (Answer)
    story.append(Paragraph("<b>Assistant Response:</b>", styles['Normal']))
    # Note: SimpleDocTemplate handles basic XML-like tags (<b>, <i>, <br/>)
    # We replace newlines with <br/> for basic formatting
    safe_content = content.replace('\n', '<br/>')
    story.append(Paragraph(safe_content, styles['Normal']))
    story.append(Spacer(1, 24))
    
    doc.build(story)
    packet.seek(0)
    new_pdf = PdfReader(packet)

    # 3. Handle Merging
    writer = PdfWriter()

    if os.path.exists(file_path):
        # Read existing
        existing_pdf = PdfReader(file_path)
        for page in existing_pdf.pages:
            writer.add_page(page)

    # Add new page(s)
    for page in new_pdf.pages:
        writer.add_page(page)

    # 4. Save back to disk
    with open(file_path, "wb") as f:
        writer.write(f)
    
    print(f"✅ Successfully appended content to: {file_path}")
    return True

