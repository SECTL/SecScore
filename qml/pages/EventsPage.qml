import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import SecScore 1.0

Item {
    id: root
    
    StudentRepo { id: studentRepo }
    EventRepo { id: eventRepo }
    ReasonRepo { id: reasonRepo }
    
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
            Item { Layout.fillWidth: true }
            Button {
                text: "添加评分"
                onClicked: scoreDialog.open()
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
                    }
                }
            }
        }
    }
    
    Dialog {
        id: scoreDialog
        title: "评分"
        anchors.centerIn: parent
        modal: true
        standardButtons: Dialog.Ok | Dialog.Cancel
        
        ColumnLayout {
            width: 300
            spacing: 10
            
            Label { text: "选择学生" }
            ComboBox {
                id: studentCombo
                Layout.fillWidth: true
                model: studentRepo.getAll()
                textRole: "name"
            }
            
            Label { text: "选择理由" }
            ComboBox {
                id: reasonCombo
                Layout.fillWidth: true
                model: reasonRepo.getAll()
                textRole: "name"
                editable: true
            }
            
            Label { text: "分值" }
            SpinBox {
                id: scoreSpin
                Layout.fillWidth: true
                from: -100
                to: 100
                value: 1
                editable: true
            }
        }
        
        onAccepted: {
            var student = studentCombo.model[studentCombo.currentIndex]
            var valChange = scoreSpin.value
            var newVal = student.score + valChange
            
            // 1. Update student score
            studentRepo.update(student.id, {"score": newVal})
            
            // 2. Create event record
            eventRepo.create({
                "type": 1, // Student
                "ref_id": student.id,
                "desc": "对 " + student.name + " 评分: " + reasonCombo.currentText,
                "val_prev": student.score,
                "val_curr": newVal,
                "sync_state": "local"
            })
            
            refresh()
        }
    }
    
    function refresh() {
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
