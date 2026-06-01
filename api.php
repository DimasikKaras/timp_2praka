<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

$file = 'data.json';
$action = $_GET['action'] ?? null;

function json_response(string $status, array $payload = [], int $code = 200): void {
    http_response_code($code);
    echo json_encode(array_merge(['status' => $status], $payload), JSON_UNESCAPED_UNICODE);
    exit;
}

function read_json_body(): ?array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : null;
}

function get_env_value(string $key, ?string $default = null): ?string {
    $value = getenv($key);
    if ($value === false || $value === '') {
        return $default;
    }
    return $value;
}

function sanitize_header_value(string $value): string {
    return trim(preg_replace('/[\r\n]+/', ' ', $value));
}

function normalize_recipients(string $value): array {
    $parts = preg_split('/\s*,\s*/', trim($value));
    $emails = [];
    foreach ($parts as $email) {
        if ($email === '') {
            continue;
        }
        if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $emails[] = $email;
        }
    }
    return $emails;
}

function smtp_read_response($socket): string {
    $data = '';
    while (!feof($socket)) {
        $line = fgets($socket, 515);
        if ($line === false) {
            break;
        }
        $data .= $line;
        if (preg_match('/^\d{3}\s/', $line)) {
            break;
        }
    }
    return $data;
}

function smtp_expect($socket, array $codes): string {
    $response = smtp_read_response($socket);
    $code = (int) substr($response, 0, 3);
    if (!in_array($code, $codes, true)) {
        throw new Exception('SMTP error: ' . trim($response));
    }
    return $response;
}

function smtp_send_mail(array $config, string $subject, string $body, array $recipients, string $from): void {
    $host = $config['host'];
    $port = $config['port'];
    $secure = $config['secure'];
    $timeout = $config['timeout'] ?? 10;

    $transportHost = $secure === 'ssl' ? "ssl://{$host}" : $host;
    $socket = stream_socket_client(
        $transportHost . ':' . $port,
        $errno,
        $errstr,
        $timeout,
        STREAM_CLIENT_CONNECT
    );

    if (!$socket) {
        throw new Exception("SMTP connection failed: {$errstr} ({$errno})");
    }

    stream_set_timeout($socket, $timeout);
    smtp_expect($socket, [220]);

    $hostname = gethostname() ?: 'localhost';
    try {
        fwrite($socket, "EHLO {$hostname}\r\n");
        smtp_expect($socket, [250]);
    } catch (Exception $e) {
        fwrite($socket, "HELO {$hostname}\r\n");
        smtp_expect($socket, [250]);
    }

    if ($secure === 'tls') {
        fwrite($socket, "STARTTLS\r\n");
        smtp_expect($socket, [220]);
        if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            throw new Exception('SMTP STARTTLS failed.');
        }
        fwrite($socket, "EHLO {$hostname}\r\n");
        smtp_expect($socket, [250]);
    }

    if (!empty($config['username'])) {
        fwrite($socket, "AUTH LOGIN\r\n");
        smtp_expect($socket, [334]);
        fwrite($socket, base64_encode($config['username']) . "\r\n");
        smtp_expect($socket, [334]);
        fwrite($socket, base64_encode($config['password'] ?? '') . "\r\n");
        smtp_expect($socket, [235]);
    }

    $from = sanitize_header_value($from);
    fwrite($socket, "MAIL FROM:<{$from}>\r\n");
    smtp_expect($socket, [250]);

    foreach ($recipients as $recipient) {
        fwrite($socket, "RCPT TO:<{$recipient}>\r\n");
        smtp_expect($socket, [250, 251]);
    }

    fwrite($socket, "DATA\r\n");
    smtp_expect($socket, [354]);

    $subject = sanitize_header_value($subject);
    $toHeader = implode(', ', $recipients);
    $headers = [
        "From: {$from}",
        "To: {$toHeader}",
        "Subject: {$subject}",
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit'
    ];

    $body = str_replace(["\r\n", "\r"], "\n", $body);
    // SMTP требует экранирования строк, начинающихся с точки (dot-stuffing).
    $body = preg_replace('/^\./m', '..', $body);
    $payload = implode("\r\n", $headers) . "\r\n\r\n" . $body;
    $payload = str_replace("\n", "\r\n", $payload);

    fwrite($socket, $payload . "\r\n.\r\n");
    smtp_expect($socket, [250]);

    fwrite($socket, "QUIT\r\n");
    fclose($socket);
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($action === 'incident') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        json_response('error', ['message' => 'Метод не поддерживается.'], 405);
    }

    $incident = read_json_body();
    if (!$incident) {
        json_response('error', ['message' => 'Некорректные данные запроса.'], 400);
    }

    $objectName = trim((string) ($incident['objectName'] ?? ''));
    $address = trim((string) ($incident['address'] ?? ''));
    $reason = trim((string) ($incident['reason'] ?? ''));
    $date = trim((string) ($incident['date'] ?? ''));
    $objectId = $incident['objectId'] ?? null;

    if ($objectName === '' || $address === '' || $reason === '' || $date === '') {
        json_response('error', ['message' => 'Заполните все обязательные поля.'], 400);
    }

    if ($objectId !== null && !is_numeric($objectId)) {
        json_response('error', ['message' => 'Некорректный идентификатор объекта.'], 400);
    }

    if (mb_strlen($objectName) > 200 || mb_strlen($address) > 300 || mb_strlen($reason) > 500) {
        json_response('error', ['message' => 'Слишком длинные значения полей.'], 400);
    }

    $smtpHost = get_env_value('SMTP_HOST');
    $smtpPortRaw = get_env_value('SMTP_PORT');
    $smtpUser = get_env_value('SMTP_USER');
    $smtpPass = get_env_value('SMTP_PASS');
    $smtpSecure = strtolower(get_env_value('SMTP_SECURE', 'tls'));
    $mailTo = get_env_value('ALARM_MAIL_TO', get_env_value('MAIL_TO'));
    $mailFrom = get_env_value('ALARM_MAIL_FROM', get_env_value('MAIL_FROM', $smtpUser));

    if (!$smtpHost || !$mailTo || !$mailFrom) {
        json_response('error', ['message' => 'Почтовая конфигурация не настроена.'], 500);
    }

    if (!filter_var($mailFrom, FILTER_VALIDATE_EMAIL)) {
        json_response('error', ['message' => 'Некорректный адрес отправителя.'], 500);
    }

    $recipients = normalize_recipients($mailTo);
    if (empty($recipients)) {
        json_response('error', ['message' => 'Не задан список получателей.'], 500);
    }

    if ($smtpPortRaw === null) {
        $smtpPort = 587;
    } else {
        $smtpPortRaw = trim($smtpPortRaw);
        if (!ctype_digit($smtpPortRaw)) {
            json_response('error', ['message' => 'Некорректный SMTP_PORT.'], 500);
        }
        $smtpPort = (int) $smtpPortRaw;
        if ($smtpPort <= 0 || $smtpPort > 65535) {
            json_response('error', ['message' => 'Некорректный SMTP_PORT.'], 500);
        }
    }

    if (!in_array($smtpSecure, ['tls', 'ssl', 'none'], true)) {
        $smtpSecure = 'tls';
    }

    if (!empty($smtpUser) && empty($smtpPass)) {
        json_response('error', ['message' => 'Не указан SMTP_PASS для SMTP_USER.'], 500);
    }

    $subject = "Тревога: {$objectName}";
    $details = [
        'Зафиксирован инцидент тревоги.',
        "Объект: {$objectName}",
        "Адрес: {$address}",
        "Причина: {$reason}",
        "Время: {$date}"
    ];
    if ($objectId !== null) {
        $details[] = "ID объекта: {$objectId}";
    }
    $body = implode("\n", $details);

    try {
        smtp_send_mail(
            [
                'host' => $smtpHost,
                'port' => $smtpPort,
                'secure' => $smtpSecure,
                'username' => $smtpUser,
                'password' => $smtpPass,
                'timeout' => 10
            ],
            $subject,
            $body,
            $recipients,
            $mailFrom
        );
    } catch (Exception $e) {
        error_log('Incident email send failed: ' . $e->getMessage());
        json_response('error', ['message' => 'Не удалось отправить письмо.'], 500);
    }

    json_response('success', ['message' => 'Уведомление отправлено.']);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    
    // Пробуем записать
    if (file_put_contents($file, $input) !== false) {
        echo json_encode(["status" => "success"]);
    } else {
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "Нет прав на запись в файл data.json. Установите CHMOD 777 на файл."]);
    }
} 
else {
    if (file_exists($file)) {
        echo file_get_contents($file);
    } else {
        // Если файла нет, отдаем пустую базу
        echo json_encode([
            "users" => [],
            "objects" => [],
            "personnel" => [],
            "events" => []
        ]);
    }
}
?>