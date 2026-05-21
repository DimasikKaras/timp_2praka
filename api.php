<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');

$file = 'data.json';

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