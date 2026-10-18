# Popup + âm thanh khi Claude làm xong việc (Stop) hoặc cần người dùng xác nhận / trả lời (Notification).
# Gọi từ hook trong .claude/settings.local.json. Dữ liệu sự kiện (JSON) được truyền qua stdin.
param([string]$Event = 'Stop')

$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$raw = ''
try { if ([Console]::IsInputRedirected) { $raw = [Console]::In.ReadToEnd() } } catch {}
$data = $null
try { if ($raw) { $data = $raw | ConvertFrom-Json } } catch {}

if ($Event -eq 'Stop') {
  $title = 'Claude đã xong việc'
  $msg = 'Đã hoàn thành lượt làm việc. Mời anh/chị xem kết quả hoặc trả lời câu hỏi.'
  $sound = 'C:\Windows\Media\tada.wav'
  $repeat = 1
  $accent = [System.Drawing.Color]::FromArgb(0, 128, 70)      # xanh Bạch Mai
} else {
  $kind = if ($data -and $data.notification_type) { [string]$data.notification_type } else { '' }
  $title = if ($kind -eq 'idle_prompt') { 'Claude đang chờ anh/chị' } else { 'Claude cần anh/chị xác nhận' }
  $detail = if ($data -and $data.message) { [string]$data.message } else { 'Vui lòng quay lại VS Code để xem.' }
  $msg = "$detail"
  $sound = 'C:\Windows\Media\Alarm01.wav'
  $repeat = 2
  $accent = [System.Drawing.Color]::FromArgb(230, 140, 0)     # cam — cần chú ý
}

# Âm thanh (chạy nền để popup hiện ngay)
$player = New-Object System.Media.SoundPlayer $sound
$soundJob = [PowerShell]::Create().AddScript({
  param($p, $n)
  for ($i = 0; $i -lt $n; $i++) { $p.PlaySync() }
}).AddArgument($player).AddArgument($repeat)
$null = $soundJob.BeginInvoke()

# Cửa sổ popup góc dưới phải, luôn nổi trên cùng, tự đóng sau 15 giây hoặc khi bấm vào
$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = 'None'
$form.StartPosition = 'Manual'
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.BackColor = [System.Drawing.Color]::White
$form.Size = New-Object System.Drawing.Size(380, 130)
$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form.Location = New-Object System.Drawing.Point(($area.Right - $form.Width - 16), ($area.Bottom - $form.Height - 16))

$bar = New-Object System.Windows.Forms.Panel
$bar.Dock = 'Left'
$bar.Width = 8
$bar.BackColor = $accent
$form.Controls.Add($bar)

$lblTitle = New-Object System.Windows.Forms.Label
$lblTitle.Text = $title
$lblTitle.Font = New-Object System.Drawing.Font('Segoe UI', 12, [System.Drawing.FontStyle]::Bold)
$lblTitle.ForeColor = $accent
$lblTitle.Location = New-Object System.Drawing.Point(22, 12)
$lblTitle.Size = New-Object System.Drawing.Size(345, 26)
$form.Controls.Add($lblTitle)

$lblMsg = New-Object System.Windows.Forms.Label
$lblMsg.Text = $msg
$lblMsg.Font = New-Object System.Drawing.Font('Segoe UI', 9.5)
$lblMsg.ForeColor = [System.Drawing.Color]::FromArgb(33, 37, 41)
$lblMsg.Location = New-Object System.Drawing.Point(22, 42)
$lblMsg.Size = New-Object System.Drawing.Size(345, 60)
$form.Controls.Add($lblMsg)

$lblHint = New-Object System.Windows.Forms.Label
$lblHint.Text = 'HRM Bạch Mai · bấm để đóng'
$lblHint.Font = New-Object System.Drawing.Font('Segoe UI', 8)
$lblHint.ForeColor = [System.Drawing.Color]::Gray
$lblHint.Location = New-Object System.Drawing.Point(22, 106)
$lblHint.Size = New-Object System.Drawing.Size(345, 18)
$form.Controls.Add($lblHint)

$close = { $form.Close() }
foreach ($c in @($form, $lblTitle, $lblMsg, $lblHint, $bar)) { $c.Add_Click($close) }

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 15000
$timer.Add_Tick({ $timer.Stop(); $form.Close() })
$form.Add_Shown({ $timer.Start(); $form.Activate() })

[System.Windows.Forms.Application]::Run($form)
exit 0
