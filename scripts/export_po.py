import os
import sys
import smtplib
from email.message import EmailMessage
import csv
from datetime import datetime
import io
from supabase import create_client, Client

def main():
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")
    smtp_host = os.environ.get("SMTP_HOST", "smtp.ionos.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASS")
    email_to = os.environ.get("EMAIL_TO", "sayed.aslam@zenarise.org")
    email_from = os.environ.get("EMAIL_FROM", smtp_user)

    if not supabase_url or not supabase_key:
        print("SUPABASE_URL and SUPABASE_KEY must be set.")
        sys.exit(1)
        
    if not smtp_user or not smtp_pass:
        print("SMTP_USER and SMTP_PASS must be set.")
        sys.exit(1)

    supabase: Client = create_client(supabase_url, supabase_key)
    
    # Fetch POs with line items
    try:
        response = supabase.table("po_register").select("*, po_line_items(*)").execute()
    except Exception as e:
        print(f"Error fetching data from Supabase: {e}")
        sys.exit(1)

    pos = response.data
    
    if not pos:
        print("No POs found.")
        sys.exit(0)

    # Generate CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    headers = [
      'PO Number', 'PO Name', 'Supplier', 'Order Date', 'ETA', 'Tracking', 'Status', 'PO Notes',
      'SKU', 'Units Ordered', 'Units Received', 'Units Per Box', 'Box Count', 'Dimensions', 'COGS', 'Shipping Cost', 'Item Notes'
    ]
    writer.writerow(headers)
    
    total_pos = len(pos)
    
    for po in pos:
        po_line_items = po.get("po_line_items", [])
        if not po_line_items:
            # Output PO without line items
            writer.writerow([
                po.get('po_number', ''),
                po.get('po_name', ''),
                po.get('supplier', ''),
                po.get('order_date', ''),
                po.get('eta', ''),
                po.get('tracking_number', ''),
                po.get('status', ''),
                po.get('notes', ''),
                '', '', '', '', '', '', '', '', ''
            ])
            continue
            
        for li in po_line_items:
            writer.writerow([
                po.get('po_number', ''),
                po.get('po_name', ''),
                po.get('supplier', ''),
                po.get('order_date', ''),
                po.get('eta', ''),
                po.get('tracking_number', ''),
                po.get('status', ''),
                po.get('notes', ''),
                li.get('sku', ''),
                li.get('units_ordered', 0) or 0,
                li.get('units_received', 0) or 0,
                li.get('units_per_box', 0) or 0,
                li.get('box_count', 0) or 0,
                li.get('dimensions', ''),
                li.get('cogs_per_unit', 0) or 0,
                li.get('shipping_cost_per_unit', 0) or 0,
                li.get('notes', '')
            ])
            
    csv_content = output.getvalue()
    
    current_date = datetime.now().strftime("%Y-%m-%d")
    
    msg = EmailMessage()
    msg["Subject"] = f"Daily PO Export - {current_date}"
    msg["From"] = email_from
    msg["To"] = email_to
    msg.set_content(f"Attached is the daily PO export.\nTotal POs: {total_pos}")
    
    msg.add_attachment(
        csv_content.encode('utf-8'),
        maintype="text",
        subtype="csv",
        filename=f"po_register_{current_date}.csv"
    )
    
    print("Sending email...")
    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
            
        print("Mail sent successfully")
    except Exception as e:
        print(f"Failed to send email: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
