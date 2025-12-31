import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Window
import "pages"

ApplicationWindow {
    id: window
    width: 1024
    height: 768
    visible: true
    title: "SecScore - 教育积分管理"
    
    // Theme bindings
    property color primaryColor: mainApp.colors.primary || "#3498db"
    property color secondaryColor: mainApp.colors.secondary || "#2ecc71"
    property color backgroundColor: mainApp.colors.background || "#f5f6fa"
    property color surfaceColor: mainApp.colors.surface || "#ffffff"
    property color textColor: mainApp.colors.text || "#2c3e50"
    property color textSecondaryColor: mainApp.colors.textSecondary || "#7f8c8d"
    property color borderColor: mainApp.colors.border || "#dcdde1"
    
    property int currentRadius: mainApp.radius.medium || 8
    property int currentSpacing: mainApp.spacing.medium || 16
    property int currentFontSize: mainApp.fonts.medium || 14
    
    color: backgroundColor
    
    header: ToolBar {
        background: Rectangle { color: surfaceColor }
        RowLayout {
            anchors.fill: parent
            anchors.leftMargin: 10
            anchors.rightMargin: 10
            ToolButton {
                text: "☰"
                onClicked: drawer.open()
            }
            Label {
                text: "SecScore"
                elide: Text.ElideRight
                horizontalAlignment: Qt.AlignHCenter
                verticalAlignment: Qt.AlignVCenter
                Layout.fillWidth: true
                color: textColor
                font.bold: true
                font.pixelSize: 18
            }
        }
    }

    Drawer {
        id: drawer
        width: 220
        height: window.height
        
        background: Rectangle { color: surfaceColor }
        
        ColumnLayout {
            anchors.fill: parent
            spacing: 0
            
            Item {
                Layout.preferredHeight: 120
                Layout.fillWidth: true
                Rectangle { color: primaryColor; anchors.fill: parent }
                ColumnLayout {
                    anchors.centerIn: parent
                    spacing: 5
                    Label {
                        text: "SecScore"
                        color: "white"
                        font.pixelSize: 24
                        font.bold: true
                        Layout.alignment: Qt.AlignHCenter
                    }
                    Label {
                        text: "v" + mainApp.appVersion
                        color: "white"
                        font.pixelSize: 12
                        Layout.alignment: Qt.AlignHCenter
                    }
                }
            }
            
            Repeater {
                model: [
                    { text: "学生管理", page: "pages/StudentsPage.qml", icon: "👤" },
                    { text: "事件记录", page: "pages/EventsPage.qml", icon: "📝" },
                    { text: "排行榜", page: "pages/LeaderboardPage.qml", icon: "🏆" },
                    { text: "同步状态", page: "pages/SyncPage.qml", icon: "🔄" },
                    { text: "设置", page: "pages/SettingsPage.qml", icon: "⚙️" }
                ]
                delegate: ItemDelegate {
                    Layout.fillWidth: true
                    text: modelData.text
                    onClicked: {
                        stackView.replace(modelData.page)
                        drawer.close()
                    }
                }
            }
            
            Item { Layout.fillHeight: true }
        }
    }

    StackView {
        id: stackView
        anchors.fill: parent
        initialItem: "pages/StudentsPage.qml"
        
        pushEnter: Transition {
            PropertyAnimation {
                property: "opacity"
                from: 0
                to: 1
                duration: 200
            }
        }
        pushExit: Transition {
            PropertyAnimation {
                property: "opacity"
                from: 1
                to: 0
                duration: 200
            }
        }
        replaceEnter: Transition {
            PropertyAnimation {
                property: "opacity"
                from: 0
                to: 1
                duration: 200
            }
        }
        replaceExit: Transition {
            PropertyAnimation {
                property: "opacity"
                from: 1
                to: 0
                duration: 200
            }
        }
    }

    // First Run Wizard Dialog
    Component {
        id: firstRunWizardComponent
        Dialog {
            id: firstRunWizard
            modal: true
            closePolicy: Popup.NoAutoClose
            width: 400
            height: 400 // Increased height for better layout
            anchors.centerIn: parent
            title: "首次运行设置"
            
            property string wizardMode: "Local"
            property string wsUrl: ""
            
            background: Rectangle {
                color: surfaceColor
                radius: currentRadius
                border.color: borderColor
            }
            
            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 20
                spacing: 16
                
                Label { 
                    text: "欢迎使用 SecScore"
                    font.pixelSize: 20
                    font.bold: true
                    color: primaryColor
                    Layout.alignment: Qt.AlignHCenter 
                }
                
                Label { 
                    text: "请选择运行模式："
                    font.pixelSize: 14
                    color: textColor
                }
                
                ButtonGroup { id: modeGroup }
                
                RadioButton {
                    text: "本地模式"
                    ButtonGroup.group: modeGroup
                    checked: true
                    onCheckedChanged: if (checked) firstRunWizard.wizardMode = "Local"
                }
                Label {
                    text: "仅使用本地数据库，数据保存在本机。"
                    color: textSecondaryColor
                    font.pixelSize: 12
                    Layout.leftMargin: 28
                }
                
                RadioButton {
                    id: remoteRadio
                    text: "远程模式"
                    ButtonGroup.group: modeGroup
                    onCheckedChanged: if (checked) firstRunWizard.wizardMode = "Remote"
                }
                Label {
                    text: "连接到远程服务器，支持多端数据同步。"
                    color: textSecondaryColor
                    font.pixelSize: 12
                    Layout.leftMargin: 28
                }
                
                TextField {
                    visible: remoteRadio.checked
                    placeholderText: "WebSocket URL (例如: ws://192.168.1.100:8080)"
                    Layout.fillWidth: true
                    onTextChanged: firstRunWizard.wsUrl = text
                }
                
                Item { Layout.fillHeight: true }
                
                RowLayout {
                    Layout.alignment: Qt.AlignRight
                    spacing: 10
                    Button { 
                        text: "退出"
                        onClicked: Qt.quit() 
                    }
                    Button {
                        text: "开始使用"
                        highlighted: true
                        enabled: !remoteRadio.checked || (firstRunWizard.wsUrl.length > 0)
                        onClicked: {
                            mainApp.setRunMode(firstRunWizard.wizardMode)
                            if (firstRunWizard.wizardMode === "Remote") {
                                mainApp.setWsUrl(firstRunWizard.wsUrl)
                            }
                            mainApp.completeFirstRun()
                            firstRunWizard.close()
                        }
                    }
                }
            }
        }
    }
    
    Component.onCompleted: {
        if (mainApp.isFirstRun()) {
            var wizard = firstRunWizardComponent.createObject(window)
            if (wizard) {
                wizard.open()
            } else {
                console.error("Failed to create wizard component")
            }
        }
    }
}
