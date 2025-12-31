import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import SecScore 1.0

Item {
    id: root

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: currentSpacing
        spacing: currentSpacing

        GroupBox {
            title: "外观"
            Layout.fillWidth: true
            ColumnLayout {
                anchors.fill: parent
                RowLayout {
                    Layout.fillWidth: true
                    Label {
                        text: "当前主题： " + themeService.currentThemeName()
                        color: textSecondaryColor
                    }
                    Item { Layout.fillWidth: true }
                }
                ComboBox {
                    id: themeCombo
                    Layout.fillWidth: true
                    model: themeService.availableThemes()
                    onActivated: themeService.loadThemeByName(currentText)
                }
            }
        }

        GroupBox {
            title: "运行模式"
            Layout.fillWidth: true
            ColumnLayout {
                anchors.fill: parent
                RowLayout {
                    Layout.fillWidth: true
                    RadioButton {
                        text: "本地模式"
                        checked: mainApp.runMode === "Local"
                        onClicked: mainApp.setRunMode("Local")
                    }
                    RadioButton {
                        text: "远程模式"
                        checked: mainApp.runMode === "Remote"
                        onClicked: mainApp.setRunMode("Remote")
                    }
                    Item { Layout.fillWidth: true }
                }
                Label {
                    text: mainApp.runMode === "Remote" ? "远程模式已启用" : "本地模式已启用"
                    color: textSecondaryColor
                }
            }
        }

        GroupBox {
            title: "网络设置"
            visible: mainApp.runMode === "Remote"
            Layout.fillWidth: true
            ColumnLayout {
                anchors.fill: parent
                Label { text: "WebSocket URL: "; font.bold: true }
                TextField {
                    id: wsUrlField
                    Layout.fillWidth: true
                    text: mainApp.wsUrl
                    placeholderText: "ws://..."
                    onAccepted: mainApp.setWsUrl(text)
                }
                RowLayout {
                    Layout.fillWidth: true
                    Label {
                        text: "当前状态: " + (syncEngine ? syncEngine.syncStatus : "未初始化")
                        color: textSecondaryColor
                    }
                    Item { Layout.fillWidth: true }
                    Button {
                        text: "应用"
                        onClicked: mainApp.setWsUrl(wsUrlField.text)
                    }
                }
            }
        }
    }
}
