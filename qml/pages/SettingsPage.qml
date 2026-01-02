import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import SecScore 1.0

Item {
    id: root

    ReasonRepo { id: reasonRepo }

    ScrollView {
        anchors.fill: parent
        contentWidth: availableWidth
        clip: true

        ColumnLayout {
            width: parent.width
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
                            text: "当前主题： " + themeService.currentThemeName
                            color: textSecondaryColor
                        }
                        Item { Layout.fillWidth: true }
                    }
                    ComboBox {
                        id: themeCombo
                        Layout.fillWidth: true
                        model: themeService.availableThemes
                        onActivated: themeService.loadThemeByName(currentText)
                    }
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 8
                        Label {
                            text: "界面缩放"
                            color: textSecondaryColor
                        }
                        Slider {
                            id: uiScaleSlider
                            Layout.fillWidth: true
                            from: 0.8
                            to: 1.5
                            stepSize: 0.05
                            value: mainApp.uiScale
                            onValueChanged: mainApp.setUiScale(value)
                        }
                        Label {
                            text: Math.round(uiScaleSlider.value * 100) + "%"
                            color: textSecondaryColor
                        }
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

            GroupBox {
                title: "理由管理"
                Layout.fillWidth: true
                ColumnLayout {
                    anchors.fill: parent
                    spacing: 10
                    
                    ListView {
                        id: reasonList
                        Layout.fillWidth: true
                        Layout.preferredHeight: contentItem.height
                        model: reasonRepo.getAll()
                        clip: true
                        spacing: 5
                        
                        delegate: RowLayout {
                            width: reasonList.width
                            spacing: 10
                            
                            Label {
                                text: modelData.name
                                Layout.fillWidth: true
                                color: textColor
                            }
                            
                            Button {
                                text: "编辑"
                                onClicked: {
                                    editReasonDialog.reasonId = modelData.id
                                    editReasonDialog.reasonName = modelData.name
                                    editReasonDialog.open()
                                }
                            }
                            
                            Button {
                                text: "删除"
                                onClicked: {
                                    reasonRepo.remove(modelData.id)
                                    reasonList.model = reasonRepo.getAll()
                                }
                            }
                        }
                    }
                    
                    Button {
                        text: "添加理由"
                        onClicked: addReasonDialog.open()
                    }
                }
            }

            GroupBox {
                title: "关于"
                Layout.fillWidth: true
                Layout.preferredHeight: 250
                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 10
                    spacing: 8
                    
                    Label {
                        text: "版本: " + mainApp.appVersion
                        font.bold: true
                        color: textColor
                    }
                    
                    TextArea {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        text: mainApp.readFile(":/ABOUT.md")
                        textFormat: Text.MarkdownText
                        readOnly: true
                        background: null
                        wrapMode: Text.WordWrap
                        color: textColor
                        font.pixelSize: currentFontSize
                        ScrollBar.vertical: ScrollBar { }
                    }
                }
            }
        }
    }
    
    Dialog {
        id: addReasonDialog
        title: "添加理由"
        anchors.centerIn: parent
        modal: true
        standardButtons: Dialog.Ok | Dialog.Cancel
        
        ColumnLayout {
            spacing: 10
            TextField {
                id: newReasonField
                placeholderText: "理由内容"
                Layout.fillWidth: true
            }
        }
        
        onAccepted: {
            if (newReasonField.text.trim() !== "") {
                reasonRepo.create({"name": newReasonField.text.trim(), "sort": 0})
                newReasonField.text = ""
                reasonList.model = reasonRepo.getAll()
            }
        }
    }
    
    Dialog {
        id: editReasonDialog
        property int reasonId
        property alias reasonName: editReasonField.text
        title: "编辑理由"
        anchors.centerIn: parent
        modal: true
        standardButtons: Dialog.Ok | Dialog.Cancel
        
        ColumnLayout {
            spacing: 10
            TextField {
                id: editReasonField
                placeholderText: "理由内容"
                Layout.fillWidth: true
            }
        }
        
        onAccepted: {
            if (editReasonField.text.trim() !== "") {
                reasonRepo.update(reasonId, {"name": editReasonField.text.trim()})
                reasonList.model = reasonRepo.getAll()
            }
        }
    }
}
