import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import SecScore 1.0
import "../components"

Item {
    id: root
    
    // Color definitions
    property color successColor: "#27ae60"
    property color errorColor: "#e74c3c"
    
    StudentRepo { id: studentRepo }
    EventRepo { id: eventRepo }
    ReasonRepo { id: reasonRepo }
    
    onVisibleChanged: if (visible) refresh()

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: currentSpacing
        spacing: currentSpacing
        
        RowLayout {
            Layout.fillWidth: true
            Label {
                text: "积分管理"
                font.pixelSize: currentFontSize + 6
                font.bold: true
                color: textColor
            }
        }
        
        // Operation Panel
        Rectangle {
            Layout.fillWidth: true
            height: 220
            color: surfaceColor
            radius: currentRadius
            
            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 16
                spacing: 12
                
                Label { 
                    text: "快速评分" 
                    font.bold: true 
                    font.pixelSize: currentFontSize + 2
                }
                
                GridLayout {
                    columns: 2
                    columnSpacing: 16
                    rowSpacing: 12
                    Layout.fillWidth: true
                    
                    Label { text: "学生:" }
                    ComboBox {
                        id: studentCombo
                        Layout.fillWidth: true
                        model: studentRepo.getAll()
                        textRole: "name"
                    }
                    
                    Label { text: "理由:" }
                    ComboBox {
                        id: reasonCombo
                        Layout.fillWidth: true
                        model: reasonRepo.getAll()
                        textRole: "name"
                        editable: true
                    }
                    
                    Label { text: "分值:" }
                    SpinBox {
                        id: scoreSpin
                        Layout.fillWidth: true
                        from: -100
                        to: 100
                        value: 1
                        editable: true
                    }
                    
                    Label { text: "备注:" }
                    TextField {
                        id: remarkField
                        Layout.fillWidth: true
                        placeholderText: "可选"
                    }
                }
                
                ThemedButton {
                    text: "提交评分"
                    Layout.alignment: Qt.AlignRight
                    highlighted: true
                    onClicked: submitScore()
                }
            }
        }
        
        Label {
            text: "最近记录"
            font.bold: true
            color: textSecondaryColor
        }
        
        ListView {
            id: eventListView
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            model: eventRepo.getAll()
            spacing: 8
            
            delegate: Rectangle {
                width: eventListView.width
                height: 70
                color: surfaceColor
                radius: currentRadius
                
                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 12
                    spacing: 12
                    
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 2
                        Label {
                            text: modelData.desc
                            font.bold: true
                            color: textColor
                        }
                        Label {
                            text: Qt.formatDateTime(new Date(modelData.timestamp * 1000), "yyyy-MM-dd HH:mm:ss")
                            font.pixelSize: currentFontSize - 2
                            color: textSecondaryColor
                        }
                    }
                    
                    Label {
                        text: (modelData.val_curr - modelData.val_prev > 0 ? "+" : "") + (modelData.val_curr - modelData.val_prev)
                        color: (modelData.val_curr - modelData.val_prev >= 0) ? successColor : errorColor
                        font.bold: true
                        font.pixelSize: currentFontSize + 4
                        Layout.preferredWidth: 60
                        horizontalAlignment: Text.AlignRight
                    }
                }
            }
        }
    }
    
    function submitScore() {
        if (studentCombo.currentIndex < 0) return
        
        var student = studentCombo.model[studentCombo.currentIndex]
        var valChange = scoreSpin.value
        var newVal = student.score + valChange
        var reasonText = reasonCombo.currentText
        if (remarkField.text) {
            reasonText += " (" + remarkField.text + ")"
        }
        
        // 1. Update student score
        studentRepo.update(student.id, {"score": newVal})
        
        // 2. Create event record
        eventRepo.create({
            "type": 1, // Student
            "ref_id": student.id,
            "desc": "对 " + student.name + " 评分: " + reasonText,
            "val_prev": student.score,
            "val_curr": newVal,
            "sync_state": "local"
        })
        
        // Reset fields
        scoreSpin.value = 1
        remarkField.text = ""
        
        refresh()
    }
    
    function refresh() {
        studentCombo.model = studentRepo.getAll()
        reasonCombo.model = reasonRepo.getAll()
        eventListView.model = eventRepo.getAll()
    }
    
    Component.onCompleted: {
        // Ensure some default reasons exist if none
        if (reasonRepo.getAll().length === 0) {
            reasonRepo.create({"name": "课堂表现优秀", "sort": 1})
            reasonRepo.create({"name": "作业按时完成", "sort": 2})
            reasonRepo.create({"name": "课堂开小差", "sort": 3})
        }
        refresh()
    }
}
