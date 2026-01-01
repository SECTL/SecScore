import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import SecScore 1.0

Rectangle {
    id: root
    
    // Theme properties (inherited or passed)
    property color surfaceColor: "#ffffff"
    property color textColor: "#2c3e50"
    property color textSecondaryColor: "#7f8c8d"
    property int currentRadius: 8
    property int currentFontSize: 14
    
    color: surfaceColor
    radius: currentRadius
    
    // Signal to notify sync status
    signal syncCompleted(bool success)
    
    Connections {
        target: syncEngine
        function onSyncCompleted(success) {
            if (success) {
                syncStatusLabel.text = "同步完成"
                syncStatusLabel.color = "#4CAF50"
            } else {
                syncStatusLabel.text = "同步失败"
                syncStatusLabel.color = "#F44336"
            }
            lastSyncTime.text = "最后同步: " + new Date().toLocaleString()
            root.syncCompleted(success)
        }
        function onSyncError(message) {
            syncStatusLabel.text = "错误: " + message
            syncStatusLabel.color = "#F44336"
        }
        function onSyncStatusChanged() {
            updateStatus()
        }
        function onOutboxChanged() {
            outboxCount.text = "待发送队列: " + syncEngine.pendingOutbox
        }
    }
    
    function updateStatus() {
        syncStatusLabel.text = "状态: " + syncEngine.syncStatus
        if (syncEngine.syncStatus.includes("error")) {
            syncStatusLabel.color = "#F44336"
        } else if (syncEngine.syncStatus.includes("synced")) {
            syncStatusLabel.color = "#4CAF50"
        } else {
            syncStatusLabel.color = textSecondaryColor
        }
    }
    
    Component.onCompleted: updateStatus()

    ColumnLayout {
        anchors.fill: parent
        spacing: 12
        anchors.margins: 12
        
        // Icon
        Label { 
            text: "🔄" 
            font.pixelSize: 36 
            Layout.alignment: Qt.AlignHCenter 
        }
        
        Label {
            text: mainApp.runMode === "Remote" ? "远程同步已开启" : "本地模式（同步已禁用）"
            font.bold: true
            font.pixelSize: currentFontSize + 1
            Layout.alignment: Qt.AlignHCenter
            horizontalAlignment: Qt.AlignHCenter
            wrapMode: Text.WordWrap
            Layout.fillWidth: true
        }
        
        ColumnLayout {
            visible: mainApp.runMode === "Remote"
            spacing: 3
            Layout.alignment: Qt.AlignHCenter
            Layout.fillWidth: true
            
            Label { 
                id: syncStatusLabel
                text: syncEngine.isSyncing ? "状态: " + syncEngine.syncStatus : "状态: 未连接"
                color: textSecondaryColor 
                Layout.alignment: Qt.AlignHCenter 
                font.pixelSize: currentFontSize - 1
            }
            
            Label { 
                id: outboxCount
                text: "待发送队列: " + syncEngine.pendingOutbox
                color: textSecondaryColor 
                Layout.alignment: Qt.AlignHCenter 
                font.pixelSize: currentFontSize - 1
            }
            
            Label { 
                id: lastSyncTime
                text: "最后同步: 从未"
                color: textSecondaryColor 
                Layout.alignment: Qt.AlignHCenter 
                font.pixelSize: currentFontSize - 1
            }
        }
        
        Item { Layout.fillHeight: true }
    }
}
