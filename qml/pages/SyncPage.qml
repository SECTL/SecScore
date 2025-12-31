import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import SecScore 1.0

Item {
    id: root
    
    Connections {
        target: syncEngine
        function onSyncCompleted(success) {
            if (success) {
                syncStatus.text = "同步完成"
                syncStatus.color = "#4CAF50"
            } else {
                syncStatus.text = "同步失败"
                syncStatus.color = "#F44336"
            }
            lastSyncTime.text = "最后同步: " + new Date().toLocaleString()
        }
        function onSyncError(message) {
            syncStatus.text = "错误: " + message
            syncStatus.color = "#F44336"
        }
        function onSyncStatusChanged() {
            syncStatus.text = "状态: " + syncEngine.syncStatus
            if (syncEngine.syncStatus.includes("error")) {
                syncStatus.color = "#F44336"
            } else if (syncEngine.syncStatus.includes("synced")) {
                syncStatus.color = "#4CAF50"
            } else {
                syncStatus.color = textSecondaryColor
            }
        }
        function onOutboxChanged() {
            outboxCount.text = "待发送队列: " + syncEngine.pendingOutbox
        }
    }
    
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: currentSpacing
        spacing: currentSpacing
        
        Label {
            text: "同步状态"
            font.pixelSize: currentFontSize + 6
            font.bold: true
            color: textColor
        }
        
        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            color: surfaceColor
            radius: currentRadius
            
            ColumnLayout {
                anchors.centerIn: parent
                spacing: 20
                
                Image {
                    source: "qrc:/qt/qml/SecScore/assets/sync.svg"
                    width: 64; height: 64
                    Layout.alignment: Qt.AlignHCenter
                    // Fallback if icon missing
                    Rectangle { anchors.fill: parent; color: "transparent"; Label { anchors.centerIn: parent; text: "🔄"; font.pixelSize: 48 } }
                }
                
                Label {
                    text: mainApp.runMode === "Remote" ? "远程同步已开启" : "本地模式（同步已禁用）"
                    font.bold: true
                    font.pixelSize: currentFontSize + 2
                    Layout.alignment: Qt.AlignHCenter
                }
                
                ColumnLayout {
                    visible: mainApp.runMode === "Remote"
                    spacing: 5
                    Layout.alignment: Qt.AlignHCenter
                    
                    Label { 
                        id: syncStatus
                        text: syncEngine.isSyncing ? "状态: " + syncEngine.syncStatus : "状态: 未连接"
                        color: textSecondaryColor 
                        Layout.alignment: Qt.AlignHCenter 
                    }
                    
                    Label { 
                        id: outboxCount
                        text: "待发送队列: " + syncEngine.pendingOutbox
                        color: textSecondaryColor 
                        Layout.alignment: Qt.AlignHCenter 
                    }
                    
                    Label { 
                        id: lastSyncTime
                        text: "最后同步: 从未"
                        color: textSecondaryColor 
                        Layout.alignment: Qt.AlignHCenter 
                    }
                }
                
                RowLayout {
                    visible: mainApp.runMode === "Remote"
                    spacing: 10
                    Layout.alignment: Qt.AlignHCenter
                    
                    Button {
                        text: syncEngine.isSyncing ? "停止同步" : "开始同步"
                        onClicked: {
                            if (syncEngine.isSyncing) {
                                syncEngine.stop()
                            } else {
                                syncEngine.start()
                            }
                        }
                    }
                    
                    Button {
                        text: "立即同步"
                        enabled: !syncEngine.isSyncing
                        onClicked: syncEngine.pullChanges()
                    }
                }
            }
        }
    }
}
